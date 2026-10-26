import { useState, useCallback, useEffect } from "react";
import { api, type Document, type DocumentListResponse, type IngestResponse, ApiError } from "../api";

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getDocuments();
      setDocuments(response.documents);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to load documents";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const addDocument = useCallback((doc: Document) => {
    setDocuments((prev) => [doc, ...prev]);
  }, []);

  const updateDocument = useCallback((documentId: string, updates: Partial<Document>) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.documentId === documentId ? { ...doc, ...updates } : doc))
    );
  }, []);

  const removeDocument = useCallback((documentId: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.documentId !== documentId));
  }, []);

  return { documents, loading, error, fetchDocuments, addDocument, updateDocument, removeDocument };
}

export function useUpload() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File): Promise<IngestResponse> => {
    setUploading(true);
    setError(null);

    try {
      const response = await api.ingestFile(file);
      return response;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Upload failed";
      setError(message);
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  return { upload, uploading, error, setError };
}

export function useQA() {
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (request: { question: string; document_id: string; limit?: number; score_threshold?: number }) => {
    setAnswering(true);
    setError(null);

    try {
      const response = await api.answerQuestion(request);
      return response;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to get answer";
      setError(message);
      throw err;
    } finally {
      setAnswering(false);
    }
  }, []);

  return { ask, answering, error, setError };
}

export function useSystemStatus() {
  const [status, setStatus] = useState<{ node: "healthy" | "unhealthy" | "checking"; python: "healthy" | "unhealthy" | "checking" }>({
    node: "checking",
    python: "checking",
  });

  const checkStatus = useCallback(async () => {
    setStatus((prev) => ({ ...prev, node: "checking", python: "checking" }));

    const [nodeResult, pythonResult] = await Promise.allSettled([
      api.healthCheck(),
      api.checkPythonHealth(),
    ]);

    setStatus({
      node: nodeResult.status === "fulfilled" && nodeResult.value.status === "healthy" ? "healthy" : "unhealthy",
      python: pythonResult.status === "fulfilled" && pythonResult.value.status === "healthy" ? "healthy" : "unhealthy",
    });
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return { status, checkStatus };
}