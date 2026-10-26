import type {
  IngestResponse,
  AnswerResponse,
  AnswerRequest,
  Document,
  DocumentListResponse,
  SystemStatus,
  RetrievalChunk,
  SearchResponse,
} from "./types";

const API_BASE = (import.meta as any).env.VITE_API_URL || "http://localhost:3000";

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type");
  const isJson = contentType?.includes("application/json");

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    let details: unknown;

    if (isJson) {
      try {
        const errorData = (await response.json()) as {
          error?: string;
          details?: { detail?: string } | unknown;
        };
        const detail = errorData.details && typeof errorData.details === "object" && "detail" in errorData.details
          ? errorData.details.detail
          : undefined;
        errorMessage = errorData.error || (typeof detail === "string" ? detail : errorMessage);
        details = errorData.details;
      } catch {
        errorMessage = await response.text();
      }
    } else {
      errorMessage = await response.text();
    }

    throw new ApiError(errorMessage, response.status, details);
  }

  if (isJson) {
    return response.json();
  }

  return response.text() as Promise<T>;
}

export const api = {
  async healthCheck(): Promise<{ status: string; service: string }> {
    const response = await fetch(`${API_BASE}/health`, {
      credentials: "include",
      signal: AbortSignal.timeout(5000),
    });
    return handleResponse(response);
  },

  async ingestFile(file: File): Promise<IngestResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE}/ingest-file`, {
      method: "POST",
      credentials: "include",
      body: formData,
      signal: AbortSignal.timeout(120000),
    });
    return handleResponse(response);
  },

  async answerQuestion(request: AnswerRequest): Promise<AnswerResponse> {
    const response = await fetch(`${API_BASE}/answer`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(60000),
    });
    return handleResponse(response);
  },

  async getDocuments(): Promise<DocumentListResponse> {
    const response = await fetch(`${API_BASE}/documents`, {
      credentials: "include",
      signal: AbortSignal.timeout(10000),
    });
    return handleResponse(response);
  },

  async getDocument(documentId: string): Promise<Document> {
    const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(documentId)}`, {
      credentials: "include",
      signal: AbortSignal.timeout(10000),
    });
    return handleResponse(response);
  },

  async deleteDocument(documentId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(documentId)}`, {
      method: "DELETE",
      credentials: "include",
      signal: AbortSignal.timeout(30000),
    });
    return handleResponse(response);
  },

  async searchChunks(question: string, documentId: string, limit = 3, scoreThreshold = 0.4): Promise<RetrievalChunk[]> {
    const response = await fetch(`${API_BASE}/search`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        document_id: documentId,
        limit,
        score_threshold: scoreThreshold,
      }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await handleResponse<SearchResponse>(response);
    return data.results;
  },

  async checkPythonHealth(): Promise<{ status: string; service: string }> {
    const response = await fetch(`${API_BASE}/health/python`, {
      credentials: "include",
      signal: AbortSignal.timeout(5000),
    });
    return handleResponse(response);
  },
};

export { ApiError };
export { API_BASE };
