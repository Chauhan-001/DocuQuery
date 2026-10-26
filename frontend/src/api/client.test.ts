import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../api/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("API client", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(global.fetch).mockReset();
  });

  describe("healthCheck", () => {
    it("returns health status on success", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        jsonResponse({ status: "healthy", service: "DocuQuery" })
      );

      const result = await api.healthCheck();
      expect(result).toEqual({ status: "healthy", service: "DocuQuery" });
    });

    it("throws ApiError on failure", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        jsonResponse({ error: "Service unavailable" }, 503)
      );

      await expect(api.healthCheck()).rejects.toThrow();
    });
  });

  describe("answerQuestion", () => {
    it("sends correct request and returns answer", async () => {
      const mockResponse = {
        answer: "Test answer",
        sources: [{ source: "test.txt", chunk_index: 0, score: 0.8 }],
        retrieved_chunks: 1,
      };

      vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse(mockResponse));

      const result = await api.answerQuestion({
        question: "What is this?",
        document_id: "doc-1",
        limit: 3,
        score_threshold: 0.4,
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/answer"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: "What is this?",
            document_id: "doc-1",
            limit: 3,
            score_threshold: 0.4,
          }),
        })
      );
    });
  });

  describe("ingestFile", () => {
    it("lets the Node API generate a document ID and sends the PDF field", async () => {
      const mockResponse = {
        document_id: "doc-server-id",
        source: "report.pdf",
        chunks_stored: 2,
        message: "File ingested successfully",
      };
      vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse(mockResponse));

      const file = new File(["pdf content"], "report.pdf", { type: "application/pdf" });
      await api.ingestFile(file);

      const [url, options] = vi.mocked(global.fetch).mock.calls[0];
      expect(url).toContain("/ingest-file");
      expect(url).not.toContain("document_id=");
      expect(options?.credentials).toBe("include");
      expect((options?.body as FormData).get("file")).toBe(file);
    });
  });

  describe("getDocuments / deleteDocument", () => {
    it("sends cookies for document listing and deletion", async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(jsonResponse({ documents: [], total: 0 }))
        .mockResolvedValueOnce(jsonResponse({ message: "Document deleted successfully." }));

      await api.getDocuments();
      await api.deleteDocument("doc-1");

      const [listUrl, listOptions] = vi.mocked(global.fetch).mock.calls[0];
      expect(listUrl).toContain("/documents");
      expect(listOptions?.credentials).toBe("include");

      const [deleteUrl, deleteOptions] = vi.mocked(global.fetch).mock.calls[1];
      expect(deleteUrl).toContain("/documents/doc-1");
      expect(deleteOptions?.method).toBe("DELETE");
      expect(deleteOptions?.credentials).toBe("include");
    });
  });

  describe("searchChunks", () => {
    it("calls the Node search endpoint", async () => {
      const mockResults = [
        { text: "chunk 1", source: "test.txt", chunk_index: 0, score: 0.9 },
        { text: "chunk 2", source: "test.txt", chunk_index: 1, score: 0.7 },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce(
        jsonResponse({ results: mockResults, count: 2 })
      );

      const result = await api.searchChunks("question", "doc-1", 5, 0.4);
      expect(result).toEqual(mockResults);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/search"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: JSON.stringify({
            question: "question",
            document_id: "doc-1",
            limit: 5,
            score_threshold: 0.4,
          }),
        })
      );
    });
  });
});