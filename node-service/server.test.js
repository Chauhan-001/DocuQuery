process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN = "http://localhost:5173";
process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef";
process.env.PYTHON_INTERNAL_TOKEN = "test-internal-token-1234";
process.env.MAX_DOCS_PER_SESSION = "3";
process.env.INGEST_RATE_LIMIT = "100";
process.env.ANSWER_RATE_LIMIT = "3";
process.env.SEARCH_RATE_LIMIT = "100";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { beforeEach } = require("node:test");

const {
  app,
  createDocumentMetadata,
  updateDocumentStatus,
  findDocument,
  findAllDocuments,
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
  ANSWER_RATE_LIMIT,
} = require("./server.js");

const ALLOWED_ORIGIN = "http://localhost:5173";
const INTERNAL_TOKEN = "test-internal-token-1234";

const mockState = {
  calls: [],
  failDelete: false,
  failIngest: false,
  failIngestFile: false,
  ingestDelayMs: 0,
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Mock outgoing fetch to the Python service so route tests do not require it.
global.fetch = async (input, init = {}) => {
  const url = String(input);
  const { pathname, searchParams } = new URL(url);
  const method = init.method || "GET";
  mockState.calls.push({ url, pathname, method, headers: init.headers || {} });

  if (pathname === "/health") {
    return jsonResponse({ status: "healthy", service: "DocuQuery" });
  }

  if (pathname === "/ingest-file") {
    if (mockState.failIngestFile) {
      return jsonResponse({ error: "simulated file ingest failure" }, 500);
    }
    return jsonResponse({
      document_id: searchParams.get("document_id"),
      source: "upload.pdf",
      chunks_stored: 2,
      message: "ok",
    });
  }

  if (pathname === "/ingest") {
    if (mockState.failIngest) {
      return jsonResponse({ error: "simulated ingest failure" }, 500);
    }
    if (mockState.ingestDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, mockState.ingestDelayMs));
    }
    const body = JSON.parse(init.body);
    return jsonResponse({
      document_id: body.document_id,
      source: body.source,
      chunks_stored: 2,
      message: "ok",
    });
  }

  if (pathname === "/answer") {
    const body = JSON.parse(init.body);
    return jsonResponse({
      answer: "answer",
      sources: [{ source: "a.txt", chunk_index: 0, score: 0.9 }],
      retrieved_chunks: 1,
      document_id: body.document_id,
    });
  }

  if (pathname === "/search") {
    return jsonResponse({
      question: "q",
      results: [{ text: "chunk", source: "a.txt", chunk_index: 0, score: 0.9 }],
      count: 1,
    });
  }

  if (pathname.startsWith("/documents/") && method === "DELETE") {
    if (mockState.failDelete) {
      return jsonResponse({ error: "simulated qdrant failure" }, 500);
    }
    return jsonResponse({ document_id: decodeURIComponent(pathname.split("/").pop()), message: "deleted" });
  }

  return jsonResponse({ error: "not mocked", pathname }, 500);
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve(server));
  });
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function newClient() {
  return { cookie: null };
}

function extractSessionCookie(setCookie) {
  if (!setCookie) {
    return null;
  }
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const value of values) {
    const match = value.match(new RegExp(`^${SESSION_COOKIE_NAME}=([^;]*)`));
    if (match) {
      return match[1];
    }
  }
  return null;
}

function request(client, server, method, path, options = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const headers = { ...(options.headers || {}) };

    if (client?.cookie) {
      headers.Cookie = `${SESSION_COOKIE_NAME}=${client.cookie}`;
    }
    if (options.origin) {
      headers.Origin = options.origin;
    }

    let payload;
    if (options.json !== undefined) {
      payload = Buffer.from(JSON.stringify(options.json));
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(payload.length);
    } else if (options.multipart) {
      payload = options.multipart.body;
      headers["Content-Type"] = options.multipart.contentType;
      headers["Content-Length"] = String(payload.length);
    }

    const req = http.request(
      { hostname: "127.0.0.1", port: address.port, path, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const cookie = extractSessionCookie(res.headers["set-cookie"]);
          if (cookie && client) {
            client.cookie = cookie;
          }
          let body = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function ensureSession(client, server) {
  if (client.cookie) {
    return;
  }
  const res = await request(client, server, "GET", "/documents");
  assert.equal(res.status, 200);
  assert.ok(client.cookie, "expected a session cookie");
  // Settle background default-document provisioning so later mock assertions
  // are not polluted by an in-flight Python call.
  await ensureDefaultDocument();
}

async function uploadText(client, server, source, text, extra = {}) {
  await ensureSession(client, server);
  return request(client, server, "POST", "/ingest", {
    origin: ALLOWED_ORIGIN,
    json: { source, text, ...extra },
  });
}

function buildMultipart(fieldName, filename, contentType, bytes) {
  const boundary = `----docuquerytest${Math.random().toString(16).slice(2)}`;
  const prefix = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    "utf8",
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    body: Buffer.concat([prefix, Buffer.from(bytes), suffix]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

beforeEach(async () => {
  await resetDocumentsForTests();
  mockState.calls.length = 0;
  mockState.failDelete = false;
  mockState.failIngest = false;
  mockState.failIngestFile = false;
  mockState.ingestDelayMs = 0;
});

// ---------- Store helpers ----------

test("createDocumentMetadata stores owner and visibility fields", () => {
  const doc = createDocumentMetadata("store_1", {
    originalname: "report.pdf",
    mimetype: "application/pdf",
    size: 1234,
    buffer: Buffer.from("x"),
  }, { ownerId: "owner-a" });

  assert.strictEqual(doc.documentId, "store_1");
  assert.strictEqual(doc.filename, "report.pdf");
  assert.strictEqual(doc.ownerId, "owner-a");
  assert.strictEqual(doc.isPublic, false);
  assert.strictEqual(doc.status, "processing");
  assert.strictEqual(doc.isDeleting, false);
  assert.strictEqual(Object.hasOwn(doc, "buffer"), false);
  assert.strictEqual(findDocument("store_1"), doc);
});

test("public default document is visible to every session", () => {
  createDocumentMetadata(DEFAULT_DOCUMENT_ID, {
    originalname: "rag-content.pdf",
    mimetype: "application/pdf",
    size: 0,
    buffer: Buffer.alloc(0),
  }, { isPublic: true });

  assert.strictEqual(isDocumentVisibleTo(findDocument(DEFAULT_DOCUMENT_ID), "owner-a"), true);
  assert.strictEqual(isDocumentVisibleTo(findDocument(DEFAULT_DOCUMENT_ID), "owner-b"), true);
  assert.strictEqual(isDocumentVisibleTo(findDocument(DEFAULT_DOCUMENT_ID), null), true);
});

test("private documents are only visible to their owner", () => {
  createDocumentMetadata("private_1", {
    originalname: "a.txt",
    mimetype: "text/plain",
    size: 1,
    buffer: Buffer.from("a"),
  }, { ownerId: "owner-a" });

  assert.strictEqual(isDocumentVisibleTo(findDocument("private_1"), "owner-a"), true);
  assert.strictEqual(isDocumentVisibleTo(findDocument("private_1"), "owner-b"), false);
  assert.strictEqual(findAllDocumentsForOwner("owner-b").some((d) => d.documentId === "private_1"), false);
});

test("findDocument returns null for unknown id", () => {
  assert.strictEqual(findDocument("does_not_exist"), null);
});

test("updateDocumentStatus transitions status and updates chunkCount", async () => {
  createDocumentMetadata("store_2", { originalname: "a.txt", mimetype: "text/plain", size: 1, buffer: Buffer.from("a") });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const before = findDocument("store_2");
  const updated = updateDocumentStatus("store_2", { status: "ready", chunkCount: 5 });
  assert.strictEqual(updated.status, "ready");
  assert.strictEqual(updated.chunkCount, 5);
  assert.ok(updated.updatedAt > before.updatedAt);
});

test("findAllDocuments returns newest first", async () => {
  createDocumentMetadata("store_old", { originalname: "o.txt", mimetype: "text/plain", size: 1, buffer: Buffer.from("o") });
  await new Promise((resolve) => setTimeout(resolve, 10));
  createDocumentMetadata("store_new", { originalname: "n.txt", mimetype: "text/plain", size: 1, buffer: Buffer.from("n") });
  const list = findAllDocuments();
  assert.ok(list.findIndex((d) => d.documentId === "store_new") < list.findIndex((d) => d.documentId === "store_old"));
});

test("deleteDocument removes the document", () => {
  createDocumentMetadata("store_del", { originalname: "d.txt", mimetype: "text/plain", size: 1, buffer: Buffer.from("d") });
  assert.strictEqual(deleteDocument("store_del"), true);
  assert.strictEqual(findDocument("store_del"), null);
  assert.strictEqual(deleteDocument("store_del"), false);
});

test("serializeDocument strips owner and internal deletion state", () => {
  const doc = createDocumentMetadata("serialize_1", {
    originalname: "s.txt",
    mimetype: "text/plain",
    size: 1,
    buffer: Buffer.from("s"),
  }, { ownerId: "owner-a" });
  updateDocumentStatus("serialize_1", { isDeleting: true, deletionError: "x", cleanupPending: true });

  const serialized = serializeDocument(findDocument("serialize_1"));
  assert.strictEqual(serialized.documentId, "serialize_1");
  assert.strictEqual(serialized.ownerId, undefined);
  assert.strictEqual(serialized.isPublic, undefined);
  assert.strictEqual(serialized.isDeleting, undefined);
  assert.strictEqual(serialized.deletionError, undefined);
  assert.strictEqual(serialized.cleanupPending, undefined);
});

// ---------- Visitor isolation ----------

test("visitor A uploads a PDF and visitor B cannot list or open it", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const b = newClient();
    await ensureSession(a, server);

    const multipart = buildMultipart("file", "report.pdf", "application/pdf", "%PDF-1.4\nsample bytes");
    const upload = await request(a, server, "POST", "/ingest-file?document_id=attacker-chosen-id", {
      origin: ALLOWED_ORIGIN,
      multipart,
    });

    assert.strictEqual(upload.status, 201);
    const documentId = upload.body.document_id;
    assert.match(documentId, /^doc_/);
    assert.notStrictEqual(documentId, "attacker-chosen-id");
    assert.strictEqual(findDocument("attacker-chosen-id"), null);

    const listB = await request(b, server, "GET", "/documents");
    assert.strictEqual(listB.status, 200);
    assert.strictEqual(listB.body.documents.some((doc) => doc.documentId === documentId), false);

    const openB = await request(b, server, "GET", `/documents/${documentId}`);
    assert.strictEqual(openB.status, 404);
    assert.strictEqual(openB.body.error, "Document not found.");

    const openA = await request(a, server, "GET", `/documents/${documentId}`);
    assert.strictEqual(openA.status, 200);
    assert.strictEqual(openA.body.documentId, documentId);
    assert.strictEqual(openA.body.ownerId, undefined);
  } finally {
    await stopServer(server);
  }
});

test("visitor B cannot search or answer using visitor A's document ID", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const b = newClient();
    const upload = await uploadText(a, server, "a.txt", "alpha private content");
    const documentId = upload.body.document_id;

    await ensureSession(b, server);

    const answer = await request(b, server, "POST", "/answer", {
      origin: ALLOWED_ORIGIN,
      json: { question: "what is private?", document_id: documentId },
    });
    assert.strictEqual(answer.status, 404);
    assert.strictEqual(answer.body.error, "Document not found.");

    const search = await request(b, server, "POST", "/search", {
      origin: ALLOWED_ORIGIN,
      json: { question: "what is private?", document_id: documentId },
    });
    assert.strictEqual(search.status, 404);
    assert.strictEqual(search.body.error, "Document not found.");
  } finally {
    await stopServer(server);
  }
});

test("visitor B cannot delete visitor A's document", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const b = newClient();
    const upload = await uploadText(a, server, "a.txt", "alpha private content");
    const documentId = upload.body.document_id;

    await ensureSession(b, server);
    mockState.calls.length = 0;

    const res = await request(b, server, "DELETE", `/documents/${documentId}`, { origin: ALLOWED_ORIGIN });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, "Document not found.");
    assert.ok(findDocument(documentId), "document should still exist");
    assert.strictEqual(mockState.calls.length, 0, "Python must not be called for a foreign delete");
  } finally {
    await stopServer(server);
  }
});

test("supplying another owner or document ID does not bypass authorization", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const b = newClient();
    const uploadA = await uploadText(a, server, "a.txt", "alpha private content");
    const documentIdA = uploadA.body.document_id;
    const ownerA = findDocument(documentIdA).ownerId;

    await ensureSession(b, server);

    const open = await request(b, server, "GET", `/documents/${documentIdA}`, {
      headers: {
        "X-Owner-Id": ownerA,
        "X-Session-Id": ownerA,
        "X-Document-Owner": ownerA,
      },
    });
    assert.strictEqual(open.status, 404);

    const forged = await uploadText(b, server, "b.txt", "beta content", {
      document_id: documentIdA,
      owner_id: ownerA,
      ownerId: ownerA,
      session_id: ownerA,
    });
    assert.strictEqual(forged.status, 201);
    assert.notStrictEqual(forged.body.document_id, documentIdA);
    assert.strictEqual(findDocument(documentIdA).ownerId, ownerA);

    const openAgain = await request(b, server, "GET", `/documents/${documentIdA}`);
    assert.strictEqual(openAgain.status, 404);

    const missing = await request(b, server, "GET", "/documents/doc_guessed_not_real");
    assert.strictEqual(missing.status, 404);
    assert.strictEqual(missing.body.error, open.body.error);
  } finally {
    await stopServer(server);
  }
});

test("same filename in two sessions does not mix ownership or content", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const b = newClient();

    const uploadA = await uploadText(a, server, "same.pdf", "alpha content");
    const uploadB = await uploadText(b, server, "same.pdf", "beta content");

    const idA = uploadA.body.document_id;
    const idB = uploadB.body.document_id;
    assert.notStrictEqual(idA, idB);
    assert.strictEqual(findDocument(idA).source, "same.pdf");
    assert.strictEqual(findDocument(idB).source, "same.pdf");
    assert.notStrictEqual(findDocument(idA).ownerId, findDocument(idB).ownerId);

    assert.strictEqual((await request(b, server, "GET", `/documents/${idA}`)).status, 404);
    assert.strictEqual((await request(a, server, "GET", `/documents/${idB}`)).status, 404);
    assert.strictEqual((await request(a, server, "GET", `/documents/${idA}`)).status, 200);
    assert.strictEqual((await request(b, server, "GET", `/documents/${idB}`)).status, 200);
  } finally {
    await stopServer(server);
  }
});

test("public sample is visible to every session but cannot be deleted", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const b = newClient();

    const listA = await request(a, server, "GET", "/documents");
    const listB = await request(b, server, "GET", "/documents");
    assert.strictEqual(listA.status, 200);
    assert.strictEqual(listB.status, 200);
    assert.ok(listA.body.documents.some((doc) => doc.documentId === DEFAULT_DOCUMENT_ID));
    assert.ok(listB.body.documents.some((doc) => doc.documentId === DEFAULT_DOCUMENT_ID));

    const detailB = await request(b, server, "GET", `/documents/${DEFAULT_DOCUMENT_ID}`);
    assert.strictEqual(detailB.status, 200);

    const deleteA = await request(a, server, "DELETE", `/documents/${DEFAULT_DOCUMENT_ID}`, { origin: ALLOWED_ORIGIN });
    const deleteB = await request(b, server, "DELETE", `/documents/${DEFAULT_DOCUMENT_ID}`, { origin: ALLOWED_ORIGIN });
    assert.strictEqual(deleteA.status, 409);
    assert.strictEqual(deleteB.status, 409);
    assert.ok(findDocument(DEFAULT_DOCUMENT_ID));
  } finally {
    await stopServer(server);
  }
});

test("a new or invalid session cannot access a previously owned document", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const upload = await uploadText(a, server, "a.txt", "alpha private content");
    const documentId = upload.body.document_id;

    const intruder = newClient();
    intruder.cookie = "invalid-session-value";
    const res = await request(intruder, server, "GET", `/documents/${documentId}`);
    assert.strictEqual(res.status, 404);

    const noCookie = newClient();
    const res2 = await request(noCookie, server, "GET", `/documents/${documentId}`);
    assert.strictEqual(res2.status, 404);
  } finally {
    await stopServer(server);
  }
});

test("expired session cleanup removes that session's documents only", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const b = newClient();
    const uploadA = await uploadText(a, server, "a.txt", "alpha content");
    const uploadB = await uploadText(b, server, "b.txt", "beta content");
    const idA = uploadA.body.document_id;
    const idB = uploadB.body.document_id;
    const ownerA = findDocument(idA).ownerId;

    sessionActivity.set(ownerA, Date.now() - SESSION_TTL_MS - 1000);
    await sweepExpiredSessions();

    assert.strictEqual(findDocument(idA), null);
    assert.ok(findDocument(idB), "other session's document must remain");
  } finally {
    await stopServer(server);
  }
});

// ---------- Deletion reliability ----------

test("Qdrant deletion failure is surfaced and the deletion can be retried", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const upload = await uploadText(a, server, "a.txt", "alpha content");
    const documentId = upload.body.document_id;

    mockState.failDelete = true;
    const failed = await request(a, server, "DELETE", `/documents/${documentId}`, { origin: ALLOWED_ORIGIN });
    assert.strictEqual(failed.status, 502);
    assert.match(failed.body.error, /not removed/i);
    const kept = findDocument(documentId);
    assert.ok(kept, "metadata must be preserved after a failed Qdrant delete");
    assert.strictEqual(kept.isDeleting, false);
    assert.ok(kept.deletionError);

    mockState.failDelete = false;
    const retried = await request(a, server, "DELETE", `/documents/${documentId}`, { origin: ALLOWED_ORIGIN });
    assert.strictEqual(retried.status, 200);
    assert.strictEqual(findDocument(documentId), null);
  } finally {
    await stopServer(server);
  }
});

test("deleting one session's document leaves another session's document intact", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const b = newClient();
    const uploadA = await uploadText(a, server, "a.txt", "alpha content");
    const uploadB = await uploadText(b, server, "b.txt", "beta content");
    const idA = uploadA.body.document_id;
    const idB = uploadB.body.document_id;

    mockState.calls.length = 0;
    const del = await request(a, server, "DELETE", `/documents/${idA}`, { origin: ALLOWED_ORIGIN });
    assert.strictEqual(del.status, 200);
    assert.strictEqual(findDocument(idA), null);
    assert.ok(findDocument(idB));

    const deleteCalls = mockState.calls.filter((call) => call.method === "DELETE");
    assert.deepStrictEqual(deleteCalls.map((call) => decodeURIComponent(call.pathname.split("/").pop())), [idA]);
  } finally {
    await stopServer(server);
  }
});

// ---------- Concurrency ----------

test("a session cannot start overlapping ingestions", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    await ensureSession(a, server);
    mockState.ingestDelayMs = 120;

    const first = request(a, server, "POST", "/ingest", {
      origin: ALLOWED_ORIGIN,
      json: { source: "a.txt", text: "first content" },
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const second = await request(a, server, "POST", "/ingest", {
      origin: ALLOWED_ORIGIN,
      json: { source: "a.txt", text: "second content" },
    });

    assert.strictEqual(second.status, 429);
    const firstResult = await first;
    assert.strictEqual(firstResult.status, 201);
  } finally {
    await stopServer(server);
  }
});

test("concurrent sessions cannot cross-contaminate documents", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const b = newClient();
    await ensureSession(a, server);
    await ensureSession(b, server);
    mockState.ingestDelayMs = 60;

    const [uploadA, uploadB] = await Promise.all([
      request(a, server, "POST", "/ingest", { origin: ALLOWED_ORIGIN, json: { source: "a.txt", text: "alpha" } }),
      request(b, server, "POST", "/ingest", { origin: ALLOWED_ORIGIN, json: { source: "b.txt", text: "beta" } }),
    ]);

    assert.strictEqual(uploadA.status, 201);
    assert.strictEqual(uploadB.status, 201);
    const idA = uploadA.body.document_id;
    const idB = uploadB.body.document_id;
    assert.notStrictEqual(idA, idB);
    assert.strictEqual((await request(b, server, "GET", `/documents/${idA}`)).status, 404);
    assert.strictEqual((await request(a, server, "GET", `/documents/${idB}`)).status, 404);
  } finally {
    await stopServer(server);
  }
});

// ---------- CORS / CSRF / cookies ----------

test("state-changing requests require a trusted Origin", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    await ensureSession(a, server);

    const missing = await request(a, server, "POST", "/ingest", { json: { source: "s", text: "text" } });
    assert.strictEqual(missing.status, 403);

    const evil = await request(a, server, "POST", "/ingest", {
      origin: "https://evil.example",
      json: { source: "s", text: "text" },
    });
    assert.strictEqual(evil.status, 403);
  } finally {
    await stopServer(server);
  }
});

test("CORS allows only configured origins and sends credentials", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const evil = await request(a, server, "GET", "/documents", { origin: "https://evil.example" });
    assert.strictEqual(evil.status, 403);

    const allowed = await request(a, server, "GET", "/documents", { origin: ALLOWED_ORIGIN });
    assert.strictEqual(allowed.status, 200);
    assert.strictEqual(allowed.headers["access-control-allow-origin"], ALLOWED_ORIGIN);
    assert.strictEqual(allowed.headers["access-control-allow-credentials"], "true");
  } finally {
    await stopServer(server);
  }
});

test("session cookie is HttpOnly and SameSite=Lax", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const res = await request(a, server, "GET", "/documents");
    const setCookie = [].concat(res.headers["set-cookie"] || []).join(";");
    assert.ok(setCookie.includes(`${SESSION_COOKIE_NAME}=`));
    assert.ok(/HttpOnly/i.test(setCookie));
    assert.ok(/SameSite=Lax/i.test(setCookie));
    assert.ok(/Path=\//i.test(setCookie));
  } finally {
    await stopServer(server);
  }
});

// ---------- Internal token ----------

test("Node forwards the internal token to Python and never returns it", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const upload = await uploadText(a, server, "a.txt", "alpha content");
    assert.strictEqual(upload.status, 201);
    const ingestCall = [...mockState.calls].reverse().find((call) => call.pathname === "/ingest");
    assert.strictEqual(ingestCall.headers["X-Internal-Token"], INTERNAL_TOKEN);

    const documentId = upload.body.document_id;
    await request(a, server, "POST", "/answer", {
      origin: ALLOWED_ORIGIN,
      json: { question: "what?", document_id: documentId },
    });
    const answerCall = [...mockState.calls].reverse().find((call) => call.pathname === "/answer");
    assert.strictEqual(answerCall.headers["X-Internal-Token"], INTERNAL_TOKEN);

    for (const call of mockState.calls) {
      assert.strictEqual(
        call.headers["X-Internal-Token"],
        INTERNAL_TOKEN,
        `expected token on ${call.method} ${call.pathname}`,
      );
    }

    assert.strictEqual(upload.raw.includes(INTERNAL_TOKEN), false);
  } finally {
    await stopServer(server);
  }
});

// ---------- Upload and request limits ----------

test("text ingestion rejects content above the character limit", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const res = await uploadText(a, server, "large.txt", "a".repeat(MAX_TEXT_LENGTH + 1));
    assert.strictEqual(res.status, 413);
    assert.ok(res.body.error.includes("character limit"));
  } finally {
    await stopServer(server);
  }
});

test("JSON bodies above 1 MB are rejected before ingestion", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    await ensureSession(a, server);
    const res = await request(a, server, "POST", "/ingest", {
      origin: ALLOWED_ORIGIN,
      json: { source: "a.txt", text: "x", padding: "x".repeat(1_100_000) },
    });
    assert.strictEqual(res.status, 413);
    assert.ok(res.body.error.includes("1 MB"));
  } finally {
    await stopServer(server);
  }
});

test("uploads rejected by magic bytes even with a PDF filename", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    await ensureSession(a, server);
    const multipart = buildMultipart("file", "report.pdf", "application/pdf", "this is not a pdf");
    const res = await request(a, server, "POST", "/ingest-file", {
      origin: ALLOWED_ORIGIN,
      multipart,
    });
    assert.strictEqual(res.status, 415);
    assert.ok(res.body.error.includes("valid PDF"));
  } finally {
    await stopServer(server);
  }
});

test("uploads above the 10 MB file limit are rejected", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    await ensureSession(a, server);
    const bytes = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1, 0x20);
    bytes.write("%PDF-", 0, "latin1");
    const multipart = buildMultipart("file", "large.pdf", "application/pdf", bytes);
    const res = await request(a, server, "POST", "/ingest-file", {
      origin: ALLOWED_ORIGIN,
      multipart,
    });
    assert.strictEqual(res.status, 413);
    assert.ok(res.body.error.includes("10 MB"));
  } finally {
    await stopServer(server);
  }
});

test("a session cannot exceed the per-session document limit", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    for (let index = 0; index < MAX_DOCS_PER_SESSION; index += 1) {
      const res = await uploadText(a, server, `doc-${index}.txt`, `content ${index}`);
      assert.strictEqual(res.status, 201);
    }
    const blocked = await uploadText(a, server, "overflow.txt", "overflow");
    assert.strictEqual(blocked.status, 429);
    assert.ok(blocked.body.error.includes("limit"));
  } finally {
    await stopServer(server);
  }
});

test("failed ingestion compensates by deleting partial chunks and metadata", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    mockState.failIngest = true;
    const res = await uploadText(a, server, "a.txt", "alpha content");
    assert.strictEqual(res.status, 500);

    const deleteCalls = mockState.calls.filter(
      (call) => call.method === "DELETE" && call.pathname.startsWith("/documents/"),
    );
    assert.strictEqual(deleteCalls.length, 1);
    assert.strictEqual(findAllDocuments().filter((doc) => doc.ownerId).length, 0);
  } finally {
    await stopServer(server);
  }
});

test("failed ingestion cleanup is retryable when Python deletion also fails", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    mockState.failIngest = true;
    mockState.failDelete = true;
    const res = await uploadText(a, server, "a.txt", "alpha content");
    assert.strictEqual(res.status, 500);

    const leftover = findAllDocuments().find((doc) => doc.ownerId);
    assert.ok(leftover);
    assert.strictEqual(leftover.status, "failed");
    assert.strictEqual(leftover.cleanupPending, true);
  } finally {
    await stopServer(server);
  }
});

test("answer requests are rate limited per session", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const upload = await uploadText(a, server, "a.txt", "alpha content");
    const documentId = upload.body.document_id;

    for (let index = 0; index < ANSWER_RATE_LIMIT; index += 1) {
      const res = await request(a, server, "POST", "/answer", {
        origin: ALLOWED_ORIGIN,
        json: { question: "what is this?", document_id: documentId },
      });
      assert.strictEqual(res.status, 200);
    }

    const limited = await request(a, server, "POST", "/answer", {
      origin: ALLOWED_ORIGIN,
      json: { question: "what is this?", document_id: documentId },
    });
    assert.strictEqual(limited.status, 429);
    assert.ok(limited.headers["retry-after"]);
  } finally {
    await stopServer(server);
  }
});

// ---------- Existing API behavior ----------

test("POST /answer returns 404 for unknown or inaccessible documents", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    await ensureSession(a, server);
    const res = await request(a, server, "POST", "/answer", {
      origin: ALLOWED_ORIGIN,
      json: { question: "what is this?", document_id: "unknown" },
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, "Document not found.");
  } finally {
    await stopServer(server);
  }
});

test("POST /answer returns 400 when an owned document is not ready", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const upload = await uploadText(a, server, "a.txt", "alpha content");
    const documentId = upload.body.document_id;
    updateDocumentStatus(documentId, { status: "processing" });

    const res = await request(a, server, "POST", "/answer", {
      origin: ALLOWED_ORIGIN,
      json: { question: "what is this?", document_id: documentId },
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes("not ready"));
  } finally {
    await stopServer(server);
  }
});

test("POST /answer proxies to Python for an owned ready document", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    const upload = await uploadText(a, server, "a.txt", "alpha content");
    const res = await request(a, server, "POST", "/answer", {
      origin: ALLOWED_ORIGIN,
      json: { question: "what is this?", document_id: upload.body.document_id },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.answer, "answer");
  } finally {
    await stopServer(server);
  }
});

test("POST /ingest requires source and text", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    await ensureSession(a, server);
    const res = await request(a, server, "POST", "/ingest", {
      origin: ALLOWED_ORIGIN,
      json: { source: "a.txt" },
    });
    assert.strictEqual(res.status, 400);
  } finally {
    await stopServer(server);
  }
});

test("POST /ingest-file requires a file", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    await ensureSession(a, server);
    const res = await request(a, server, "POST", "/ingest-file", { origin: ALLOWED_ORIGIN });
    assert.strictEqual(res.status, 400);
  } finally {
    await stopServer(server);
  }
});

test("GET /documents/:documentId returns only visible documents", async () => {
  const server = await startServer();
  try {
    const a = newClient();
    await ensureSession(a, server);
    const res = await request(a, server, "GET", "/documents/doc_missing");
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, "Document not found.");
  } finally {
    await stopServer(server);
  }
});

test("GET /health reports healthy without session or origin", async () => {
  const server = await startServer();
  try {
    const res = await request(null, server, "GET", "/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, "healthy");
    assert.strictEqual(res.body.service, "DocuQuery Node API");
    assert.strictEqual(res.body.mongodb, undefined);
  } finally {
    await stopServer(server);
  }
});
