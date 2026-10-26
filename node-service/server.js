require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const session = require("express-session");
const { randomUUID, randomBytes } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const app = express();
const PORT = process.env.PORT || 3000;
const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://127.0.0.1:8000";
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 24 * 60 * 60 * 1000;
const SESSION_COOKIE_NAME = "dq_sid";
const DEV_INTERNAL_TOKEN = "dev-docuquery-internal-token";
const DEFAULT_DOCUMENT_ID = "rag-content";
const DEFAULT_DOCUMENT_PATH = process.env.DEFAULT_DOCUMENT_PATH ||
  path.resolve(__dirname, "../python-service/rag-content.pdf");
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 100_000;
const MAX_SOURCE_LENGTH = 300;
const MAX_DOCS_PER_SESSION = Number(process.env.MAX_DOCS_PER_SESSION) || 10;
const INGEST_RATE_LIMIT = Number(process.env.INGEST_RATE_LIMIT) || 6;
const INGEST_RATE_WINDOW_MS = Number(process.env.INGEST_RATE_WINDOW_MS) || 10 * 60 * 1000;
const ANSWER_RATE_LIMIT = Number(process.env.ANSWER_RATE_LIMIT) || 20;
const ANSWER_RATE_WINDOW_MS = 60 * 1000;
const SEARCH_RATE_LIMIT = Number(process.env.SEARCH_RATE_LIMIT) || 60;
const SEARCH_RATE_WINDOW_MS = 60 * 1000;

function resolveSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (IS_PRODUCTION) {
    if (!secret || secret.length < 32) {
      throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
    }
    return secret;
  }
  if (secret && secret.length >= 16) {
    return secret;
  }
  console.warn("SESSION_SECRET is not set; using an ephemeral development secret. Sessions will be invalidated on restart.");
  return randomBytes(32).toString("hex");
}

function resolveInternalToken() {
  const token = process.env.PYTHON_INTERNAL_TOKEN;
  if (IS_PRODUCTION) {
    if (!token || token.length < 16) {
      throw new Error("PYTHON_INTERNAL_TOKEN must be set to at least 16 characters in production.");
    }
    return token;
  }
  if (token && token.trim()) {
    return token.trim();
  }
  console.warn("PYTHON_INTERNAL_TOKEN is not set; using the development internal token.");
  return DEV_INTERNAL_TOKEN;
}

const SESSION_SECRET = resolveSessionSecret();
const PYTHON_INTERNAL_TOKEN = resolveInternalToken();

const frontendOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  return frontendOrigins.includes(origin);
}

app.use(cors({
  origin(origin, callback) {
    // Requests without an Origin header are not browser cross-origin requests.
    // State-changing requests are still protected by requireTrustedOrigin below.
    if (!origin) {
      return callback(null, true);
    }
    const allowed = isAllowedOrigin(origin);
    callback(allowed ? null : new Error("Origin is not allowed by CORS"), allowed);
  },
  credentials: true,
}));

app.use(session({
  name: SESSION_COOKIE_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    maxAge: SESSION_TTL_MS,
    path: "/",
  },
}));

app.use(express.json({ limit: "1mb" }));

// In-memory document metadata store (temporary, process-scoped).
// Metadata is lost on process restart; sessions are also held in process memory
// by express-session's MemoryStore, so restarts invalidate session cookies.
const documents = new Map();
const sessionActivity = new Map();
const activeIngests = new Set();
const rateLimitBuckets = new Map();
let defaultDocumentProvisionPromise = null;

function now() {
  return new Date();
}

function createDocumentMetadata(documentId, file, options = {}) {
  const doc = {
    documentId,
    filename: file.originalname,
    source: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    status: "processing",
    chunkCount: 0,
    errorMessage: undefined,
    isDefault: documentId === DEFAULT_DOCUMENT_ID,
    isPublic: options.isPublic === true,
    ownerId: options.ownerId ?? null,
    isDeleting: false,
    deletionError: undefined,
    cleanupPending: false,
    createdAt: now(),
    updatedAt: now(),
  };
  documents.set(documentId, doc);
  return doc;
}

function updateDocumentStatus(documentId, updates) {
  const existing = documents.get(documentId);
  if (!existing) {
    return null;
  }
  const updated = {
    ...existing,
    ...updates,
    updatedAt: now(),
  };
  documents.set(documentId, updated);
  return updated;
}

function findDocument(documentId) {
  return documents.get(documentId) || null;
}

function findAllDocuments() {
  return [...documents.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function isDocumentVisibleTo(doc, ownerId) {
  if (!doc) {
    return false;
  }
  return doc.isPublic === true || (typeof ownerId === "string" && doc.ownerId === ownerId);
}

function findVisibleDocument(documentId, ownerId) {
  const doc = findDocument(documentId);
  return isDocumentVisibleTo(doc, ownerId) ? doc : null;
}

function findAllDocumentsForOwner(ownerId) {
  return findAllDocuments().filter((doc) => isDocumentVisibleTo(doc, ownerId));
}

function countOwnedDocuments(ownerId) {
  let count = 0;
  for (const doc of documents.values()) {
    if (!doc.isPublic && doc.ownerId === ownerId) {
      count += 1;
    }
  }
  return count;
}

function deleteDocument(documentId) {
  return documents.delete(documentId);
}

function serializeDocument(doc) {
  if (!doc) {
    return null;
  }
  const {
    ownerId,
    isPublic,
    isDeleting,
    deletionError,
    cleanupPending,
    ...publicFields
  } = doc;
  return publicFields;
}

function pythonHeaders(extra = {}) {
  return { "X-Internal-Token": PYTHON_INTERNAL_TOKEN, ...extra };
}

function touchSession(req) {
  let ownerId = req.session.ownerId;
  if (!ownerId) {
    ownerId = randomUUID();
    req.session.ownerId = ownerId;
    req.session.createdAt = Date.now();
  }
  req.ownerId = ownerId;
  sessionActivity.set(ownerId, Date.now());
  return ownerId;
}

function withSession(req, res, next) {
  touchSession(req);
  next();
}

function requestOrigin(req) {
  const origin = req.get("origin");
  if (origin) {
    return origin;
  }
  const referer = req.get("referer");
  if (!referer) {
    return null;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function requireTrustedOrigin(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }
  const origin = requestOrigin(req);
  if (!origin) {
    return res.status(403).json({ error: "Request origin could not be verified." });
  }
  const selfOrigin = `${req.protocol}://${req.get("host")}`;
  if (isAllowedOrigin(origin) || origin === selfOrigin) {
    return next();
  }
  return res.status(403).json({ error: "Request origin is not allowed." });
}

app.use(requireTrustedOrigin);

function beginIngest(ownerId) {
  if (activeIngests.has(ownerId)) {
    return false;
  }
  activeIngests.add(ownerId);
  return true;
}

function endIngest(ownerId) {
  activeIngests.delete(ownerId);
}

function consumeRateLimit(ownerId, action, limit, windowMs) {
  const key = `${ownerId}:${action}`;
  const currentTime = Date.now();
  const timestamps = (rateLimitBuckets.get(key) || [])
    .filter((timestamp) => currentTime - timestamp < windowMs);

  if (timestamps.length >= limit) {
    const retryAfterMs = Math.max(1, windowMs - (currentTime - timestamps[0]));
    rateLimitBuckets.set(key, timestamps);
    return { allowed: false, retryAfterMs };
  }

  timestamps.push(currentTime);
  rateLimitBuckets.set(key, timestamps);
  return { allowed: true, retryAfterMs: 0 };
}

function rateLimit(action, limit, windowMs) {
  return (req, res, next) => {
    const result = consumeRateLimit(req.ownerId, action, limit, windowMs);
    if (!result.allowed) {
      res.set("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    return next();
  };
}

const ingestRateLimit = rateLimit("ingest", INGEST_RATE_LIMIT, INGEST_RATE_WINDOW_MS);
const answerRateLimit = rateLimit("answer", ANSWER_RATE_LIMIT, ANSWER_RATE_WINDOW_MS);
const searchRateLimit = rateLimit("search", SEARCH_RATE_LIMIT, SEARCH_RATE_WINDOW_MS);

function enforceDocumentLimit(req, res, next) {
  if (countOwnedDocuments(req.ownerId) >= MAX_DOCS_PER_SESSION) {
    return res.status(429).json({
      error: `This session has reached the limit of ${MAX_DOCS_PER_SESSION} uploaded documents. Delete a document to upload another.`,
    });
  }
  return next();
}

async function cleanupFailedIngest(documentId) {
  try {
    await deleteFromPython(documentId);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cleanup failed.";
    updateDocumentStatus(documentId, {
      status: "failed",
      cleanupPending: true,
      deletionError: message,
      errorMessage: "Ingestion failed and cleanup could not be completed. Deletion will be retried.",
    });
    return false;
  }
}

async function provisionDefaultDocument() {
  let doc = findDocument(DEFAULT_DOCUMENT_ID);
  try {
    const fileBuffer = await fs.promises.readFile(DEFAULT_DOCUMENT_PATH);
    const filename = path.basename(DEFAULT_DOCUMENT_PATH);
    const file = {
      originalname: filename,
      mimetype: "application/pdf",
      size: fileBuffer.length,
      buffer: fileBuffer,
    };

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error("The shared default PDF exceeds the 10 MB ingestion limit.");
    }

    if (!doc) {
      doc = createDocumentMetadata(DEFAULT_DOCUMENT_ID, file, { isPublic: true });
    } else {
      updateDocumentStatus(DEFAULT_DOCUMENT_ID, { status: "processing", errorMessage: undefined });
      doc = findDocument(DEFAULT_DOCUMENT_ID);
    }

    // Python's ingest_document replaces any previously indexed version, so no
    // separate "is it already indexed?" check is needed before re-ingesting.
    const formData = new FormData();
    formData.append("file", new Blob([fileBuffer], { type: file.mimetype }), filename);
    const response = await fetch(
      `${PYTHON_API_URL}/ingest-file?document_id=${encodeURIComponent(DEFAULT_DOCUMENT_ID)}`,
      {
        method: "POST",
        headers: pythonHeaders(),
        body: formData,
        signal: AbortSignal.timeout(180000),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || data.details?.detail || data.error || `Ingestion failed (HTTP ${response.status}).`);
    }

    return updateDocumentStatus(DEFAULT_DOCUMENT_ID, {
      status: "ready",
      chunkCount: data.chunks_stored,
      errorMessage: undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shared default PDF ingestion failed.";
    console.error("Shared default PDF provisioning failed:", message);
    if (!doc) {
      doc = createDocumentMetadata(DEFAULT_DOCUMENT_ID, {
        originalname: path.basename(DEFAULT_DOCUMENT_PATH),
        mimetype: "application/pdf",
        size: 0,
        buffer: Buffer.alloc(0),
      }, { isPublic: true });
    }
    // Keep as "processing" so the next request can retry instead of staying "failed".
    return updateDocumentStatus(DEFAULT_DOCUMENT_ID, { status: "processing", errorMessage: message });
  }
}

function ensureDefaultDocument() {
  const existing = findDocument(DEFAULT_DOCUMENT_ID);
  if (existing?.status === "ready") {
    return Promise.resolve(existing);
  }
  if (!defaultDocumentProvisionPromise) {
    defaultDocumentProvisionPromise = provisionDefaultDocument()
      .finally(() => {
        defaultDocumentProvisionPromise = null;
      });
  }
  return defaultDocumentProvisionPromise;
}

function ensurePublicDefaultDocument() {
  if (!findDocument(DEFAULT_DOCUMENT_ID)) {
    createDocumentMetadata(DEFAULT_DOCUMENT_ID, {
      originalname: path.basename(DEFAULT_DOCUMENT_PATH),
      mimetype: "application/pdf",
      size: 0,
      buffer: Buffer.alloc(0),
    }, { isPublic: true });
    void ensureDefaultDocument();
  }
}

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "DocuQuery Node API",
  });
});

app.get("/health/python", async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_API_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error("Python health check failed:", error.message);
    return res.status(502).json({ error: "Could not connect to the Python service." });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
    fields: 5,
    parts: 10,
  },
});

function generateDocumentId() {
  return `doc_${randomUUID()}`;
}

app.post("/ingest-file", withSession, ingestRateLimit, enforceDocumentLimit, upload.single("file"), async (req, res) => {
  const ownerId = req.ownerId;
  if (!beginIngest(ownerId)) {
    return res.status(429).json({ error: "An ingestion is already in progress for this session." });
  }
  let documentId;
  let metadataCreated = false;
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Please upload a file using the 'file' field." });
    }

    if (file.mimetype !== "application/pdf") {
      return res.status(415).json({ error: "Only PDF files are supported." });
    }

    if (file.originalname.length > MAX_SOURCE_LENGTH) {
      return res.status(400).json({ error: `Filename must be at most ${MAX_SOURCE_LENGTH} characters.` });
    }

    if (
      !file.buffer || file.buffer.length === 0 ||
      !file.buffer.subarray(0, 1024).toString("latin1").includes("%PDF-")
    ) {
      return res.status(415).json({ error: "Only valid PDF files are supported." });
    }

    // Document IDs and ownership are always derived server-side. Any
    // document_id supplied by the client is intentionally ignored.
    documentId = generateDocumentId();

    createDocumentMetadata(documentId, file, { ownerId });
    metadataCreated = true;

    const formData = new FormData();
    formData.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname);

    const url = `${PYTHON_API_URL}/ingest-file?document_id=${encodeURIComponent(documentId)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: pythonHeaders(),
      body: formData,
      signal: AbortSignal.timeout(180000),
    });
    const data = await response.json();

    if (!response.ok) {
      const cleaned = await cleanupFailedIngest(documentId);
      if (cleaned) {
        deleteDocument(documentId);
      }
      return res.status(response.status).json({ error: "Python file ingestion service returned an error.", details: data });
    }

    await updateDocumentStatus(documentId, { status: "ready", chunkCount: data.chunks_stored });

    return res.status(201).json({ ...data, document_id: documentId });
  } catch (error) {
    console.error("File ingestion failed:", error.message);
    if (metadataCreated) {
      const cleaned = await cleanupFailedIngest(documentId);
      if (cleaned) {
        deleteDocument(documentId);
      }
    }
    return res.status(502).json({ error: "Could not process the uploaded file." });
  } finally {
    endIngest(ownerId);
  }
});

app.post("/ingest", withSession, ingestRateLimit, enforceDocumentLimit, async (req, res) => {
  const ownerId = req.ownerId;
  if (!beginIngest(ownerId)) {
    return res.status(429).json({ error: "An ingestion is already in progress for this session." });
  }
  let documentId;
  let metadataCreated = false;
  try {
    const { source, text } = req.body;

    if (
      typeof source !== "string" || !source.trim() ||
      typeof text !== "string" || !text.trim()
    ) {
      return res.status(400).json({ error: "source and text are required." });
    }

    // Document IDs are always generated server-side. The client-supplied
    // document_id (if any) is ignored and never used as proof of ownership.
    documentId = generateDocumentId();

    const trimmedSource = source.trim();
    const trimmedText = text.trim();

    if (trimmedSource.length > MAX_SOURCE_LENGTH) {
      return res.status(400).json({ error: `Source must be at most ${MAX_SOURCE_LENGTH} characters.` });
    }
    if (trimmedText.length > MAX_TEXT_LENGTH) {
      return res.status(413).json({ error: `Text exceeds the ${MAX_TEXT_LENGTH.toLocaleString()} character limit.` });
    }

    createDocumentMetadata(documentId, {
      originalname: trimmedSource,
      mimetype: "text/plain",
      size: Buffer.byteLength(trimmedText, "utf8"),
      buffer: Buffer.from(trimmedText, "utf8"),
    }, { ownerId });
    metadataCreated = true;

    const response = await fetch(`${PYTHON_API_URL}/ingest`, {
      method: "POST",
      headers: pythonHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ document_id: documentId, source: trimmedSource, text: trimmedText }),
      signal: AbortSignal.timeout(120000),
    });

    const data = await response.json();

    if (!response.ok) {
      const cleaned = await cleanupFailedIngest(documentId);
      if (cleaned) {
        deleteDocument(documentId);
      }
      return res.status(response.status).json({ error: "Python ingestion service returned an error.", details: data });
    }

    await updateDocumentStatus(documentId, { status: "ready", chunkCount: data.chunks_stored });

    return res.status(201).json({ ...data, document_id: documentId });
  } catch (error) {
    console.error("Ingestion request failed:", error.message);
    if (metadataCreated) {
      const cleaned = await cleanupFailedIngest(documentId);
      if (cleaned) {
        deleteDocument(documentId);
      }
    }
    return res.status(502).json({ error: "Could not connect to the Python ingestion service." });
  } finally {
    endIngest(ownerId);
  }
});

app.post("/answer", withSession, answerRateLimit, async (req, res) => {
  try {
    const { question, document_id, limit, score_threshold, use_hyde } = req.body;

    if (
      typeof question !== "string" || question.trim().length < 3 ||
      typeof document_id !== "string" || !document_id.trim()
    ) {
      return res.status(400).json({ error: "A valid question and document_id are required." });
    }

    const doc = findVisibleDocument(document_id.trim(), req.ownerId);
    if (!doc) {
      return res.status(404).json({ error: "Document not found." });
    }
    if (doc.isDeleting) {
      return res.status(409).json({ error: "Document is being deleted." });
    }
    if (doc.status !== "ready") {
      return res.status(400).json({ error: `Document is not ready for querying (status: ${doc.status}).` });
    }

    const response = await fetch(`${PYTHON_API_URL}/answer`, {
      method: "POST",
      headers: pythonHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        question: question.trim(),
        document_id: document_id.trim(),
        limit: limit && Number.isInteger(limit) && limit >= 1 && limit <= 10 ? limit : 3,
        score_threshold: typeof score_threshold === "number" && score_threshold >= 0 && score_threshold <= 1 ? score_threshold : 0.4,
        use_hyde: typeof use_hyde === "boolean" ? use_hyde : true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: "Python RAG service returned an error.", details: data });
    }

    return res.json(data);
  } catch (error) {
    console.error("RAG request failed:", error.message);
    return res.status(502).json({ error: "Could not connect to the Python RAG service." });
  }
});

app.post("/search", withSession, searchRateLimit, async (req, res) => {
  try {
    const { question, document_id, limit, score_threshold } = req.body;

    if (
      typeof question !== "string" || question.trim().length < 3 ||
      typeof document_id !== "string" || !document_id.trim()
    ) {
      return res.status(400).json({ error: "A valid question and document_id are required." });
    }

    const doc = findVisibleDocument(document_id.trim(), req.ownerId);
    if (!doc) {
      return res.status(404).json({ error: "Document not found." });
    }
    if (doc.isDeleting) {
      return res.status(409).json({ error: "Document is being deleted." });
    }
    if (doc.status !== "ready") {
      return res.status(400).json({ error: `Document is not ready for search (status: ${doc.status}).` });
    }

    const response = await fetch(`${PYTHON_API_URL}/search`, {
      method: "POST",
      headers: pythonHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        question: question.trim(),
        document_id: document_id.trim(),
        limit: Number.isInteger(limit) && limit >= 1 && limit <= 5 ? limit : 3,
        score_threshold: typeof score_threshold === "number" && score_threshold >= 0 && score_threshold <= 1 ? score_threshold : 0.4,
      }),
      signal: AbortSignal.timeout(60000),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: "Python search service returned an error.", details: data });
    }

    return res.json(data);
  } catch (error) {
    console.error("Search request failed:", error.message);
    return res.status(502).json({ error: "Could not connect to the Python search service." });
  }
});

app.get("/documents", withSession, async (req, res) => {
  try {
    // Ensure the public sample exists in the metadata store so it appears
    // in every visitor's library even before ingestion completes.
    ensurePublicDefaultDocument();
    const documentsList = findAllDocumentsForOwner(req.ownerId).map(serializeDocument);
    res.json({ documents: documentsList, total: documentsList.length });
  } catch (error) {
    console.error("Failed to list documents:", error.message);
    res.status(500).json({ error: "Failed to retrieve documents." });
  }
});

app.get("/documents/:documentId", withSession, async (req, res) => {
  try {
    const { documentId } = req.params;
    const doc = findVisibleDocument(documentId, req.ownerId);
    if (!doc) {
      return res.status(404).json({ error: "Document not found." });
    }
    res.json(serializeDocument(doc));
  } catch (error) {
    console.error("Failed to get document:", error.message);
    res.status(500).json({ error: "Failed to retrieve document." });
  }
});

async function deleteFromPython(documentId) {
  const response = await fetch(`${PYTHON_API_URL}/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
    headers: pythonHeaders(),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || data.detail || `Python service returned ${response.status}`);
  }
  return response.json();
}

app.delete("/documents/:documentId", withSession, async (req, res) => {
  const { documentId } = req.params;
  try {
    const doc = findVisibleDocument(documentId, req.ownerId);
    if (!doc) {
      return res.status(404).json({ error: "Document not found." });
    }
    if (doc.isDefault || doc.isPublic) {
      return res.status(409).json({ error: "The shared default document cannot be deleted." });
    }
    if (doc.isDeleting) {
      return res.status(409).json({ error: "Deletion is already in progress for this document." });
    }

    updateDocumentStatus(documentId, { isDeleting: true, deletionError: undefined });

    try {
      await deleteFromPython(documentId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Python deletion failed.";
      updateDocumentStatus(documentId, {
        isDeleting: false,
        deletionError: message,
        errorMessage: `Deletion failed: ${message}`,
      });
      // Keep the metadata so the owner can retry the deletion safely.
      return res.status(502).json({
        error: "Document deletion failed. The document was not removed and can be retried.",
        details: message,
      });
    }

    deleteDocument(documentId);
    res.json({ message: "Document deleted successfully." });
  } catch (error) {
    console.error("Document deletion failed:", error.message);
    updateDocumentStatus(documentId, {
      isDeleting: false,
      deletionError: "Unexpected deletion failure.",
    });
    res.status(500).json({ error: "Failed to delete document." });
  }
});

async function sweepExpiredSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  const expiredDocuments = [...documents.values()].filter((doc) => {
    if (!doc.ownerId || doc.isPublic || doc.isDeleting) {
      return false;
    }
    const lastSeen = sessionActivity.get(doc.ownerId) ?? doc.createdAt.getTime();
    return lastSeen < cutoff;
  });

  for (const doc of expiredDocuments) {
    try {
      await deleteFromPython(doc.documentId);
      deleteDocument(doc.documentId);
    } catch (error) {
      updateDocumentStatus(doc.documentId, {
        cleanupPending: true,
        errorMessage: "Session expired and Qdrant cleanup failed; deletion will be retried.",
      });
    }
  }

  for (const [ownerId, lastSeen] of sessionActivity.entries()) {
    if (lastSeen < cutoff) {
      sessionActivity.delete(ownerId);
    }
  }

  const maxRateWindowMs = Math.max(
    INGEST_RATE_WINDOW_MS,
    ANSWER_RATE_WINDOW_MS,
    SEARCH_RATE_WINDOW_MS,
  );
  const currentTime = Date.now();
  for (const [key, timestamps] of rateLimitBuckets.entries()) {
    const recent = timestamps.filter((timestamp) => currentTime - timestamp < maxRateWindowMs);
    if (recent.length > 0) {
      rateLimitBuckets.set(key, recent);
    } else {
      rateLimitBuckets.delete(key);
    }
  }
}

const sessionSweepTimer = setInterval(() => {
  void sweepExpiredSessions();
}, 10 * 60 * 1000);
if (typeof sessionSweepTimer.unref === "function") {
  sessionSweepTimer.unref();
}

app.use((err, req, res, next) => {
  if (err && String(err.message || "").includes("CORS")) {
    return res.status(403).json({ error: "Origin is not allowed." });
  }
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body exceeds the 1 MB limit." });
  }
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File exceeds the 10 MB limit." });
    }
    return res.status(400).json({ error: "Invalid file upload." });
  }
  console.error("Unhandled request error:", err && err.message ? err.message : "unknown error");
  return res.status(500).json({ error: "Internal server error." });
});

async function resetDocumentsForTests() {
  const pending = defaultDocumentProvisionPromise;
  defaultDocumentProvisionPromise = null;
  if (pending) {
    try {
      await pending;
    } catch {
      // Ignore provisioning errors while resetting test state.
    }
  }
  documents.clear();
  sessionActivity.clear();
  activeIngests.clear();
  rateLimitBuckets.clear();
}

module.exports = {
  app,
  createDocumentMetadata,
  updateDocumentStatus,
  findDocument,
  findAllDocuments,
  findVisibleDocument,
  findAllDocumentsForOwner,
  isDocumentVisibleTo,
  serializeDocument,
  deleteDocument,
  ensureDefaultDocument,
  sweepExpiredSessions,
  sessionActivity,
  resetDocumentsForTests,
  DEFAULT_DOCUMENT_ID,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  MAX_FILE_SIZE_BYTES,
  MAX_TEXT_LENGTH,
  MAX_DOCS_PER_SESSION,
  INGEST_RATE_LIMIT,
  ANSWER_RATE_LIMIT,
  SEARCH_RATE_LIMIT,
};

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Node API running at http://localhost:${PORT}`);
  });
}
