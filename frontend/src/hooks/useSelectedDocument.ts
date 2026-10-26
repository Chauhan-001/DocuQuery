import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export function useSelectedDocument() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDocumentId = searchParams.get("documentId");

  const setSelectedDocumentId = useCallback((documentId: string | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (documentId) {
        next.set("documentId", documentId);
      } else {
        next.delete("documentId");
      }
      return next;
    });
  }, [setSearchParams]);

  return { selectedDocumentId, setSelectedDocumentId };
}
