export interface IngestResponse {
  document_id: string;
  source: string;
  chunks_stored: number;
  message: string;
}

export interface AnswerResponse {
  answer: string;
  sources: Source[];
  retrieved_chunks: number;
  pipeline?: PipelineTrace;
}

export interface PipelineResultItem {
  id: string;
  source: string;
  chunk_index: number;
  score: number;
  preview: string;
}

export interface PipelineSearchTrace {
  duration_ms: number;
  results: PipelineResultItem[];
}

export interface PipelineQueryTrace {
  query: string;
  hyde?: {
    enabled: boolean;
    duration_ms: number;
    generated: boolean;
    embedding_used: boolean;
    embedding_fallback: boolean;
    preview: string;
  };
  dense: PipelineSearchTrace;
  bm25: PipelineSearchTrace;
  rrf: {
    duration_ms: number;
    candidate_count: number;
    results: PipelineResultItem[];
  };
  hydrate?: {
    duration_ms: number;
    candidate_count: number;
  };
  rerank: PipelineSearchTrace;
}

export interface PipelineTrace {
  question?: string;
  use_hyde?: boolean;
  rewriting?: {
    duration_ms: number;
    original_query: string;
    rewritten_query: string;
  };
  decomposition?: {
    duration_ms: number;
    queries: string[];
  };
  retrieval_queries?: PipelineQueryTrace[];
  merged?: PipelineResultItem[];
  context?: {
    duration_ms: number;
    characters: number;
    sources: Array<{
      source: string;
      chunk_index: number;
    }>;
  };
  compression?: {
    status: "compressed" | "fallback" | "skipped";
    duration_ms: number;
    input_characters: number;
    output_characters: number;
    preview: string;
  };
  generation?: {
    duration_ms: number;
  };
}

export interface SearchResponse {
  question: string;
  results: RetrievalChunk[];
  count: number;
}

export interface Source {
  source: string;
  chunk_index: number;
  score: number;
}

export interface Document {
  documentId: string;
  filename: string;
  source: string;
  mimeType: string;
  sizeBytes: number;
  status: "processing" | "ready" | "failed";
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
}

export interface AnswerRequest {
  question: string;
  document_id: string;
  limit?: number;
  score_threshold?: number;
  use_hyde?: boolean;
}

export interface IngestFileRequest {
  document_id: string;
  file: File;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export type NodeStatus = "healthy" | "unhealthy" | "checking";
export type PythonStatus = "healthy" | "unhealthy" | "checking";

export interface SystemStatus {
  node: NodeStatus;
  python: PythonStatus;
}

export interface RetrievalChunk {
  text: string;
  source: string;
  chunk_index: number;
  score: number;
  chunk_length?: number;
}

export interface PipelineStage {
  id: string;
  label: string;
  description: string;
  technology: string;
  status: "pending" | "active" | "completed" | "error" | "skipped";
  data?: unknown;
}