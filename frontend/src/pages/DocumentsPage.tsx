import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDocuments } from "../hooks/useDocuments";
import { useSelectedDocument } from "../hooks/useSelectedDocument";
import { api } from "../api";
import { UploadArea } from "../components/UploadArea";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge, StatusIndicator } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { Separator } from "../components/ui/Separator";
import { DocumentIcon, TrashIcon, SearchIcon, RefreshIcon, LoaderIcon, AlertCircleIcon, CheckCircleIcon } from "../components/icons";
import { cn, formatFileSize, formatDate } from "../utils";
import type { Document } from "../api/types";

export function DocumentsPage() {
  const navigate = useNavigate();
  const { selectedDocumentId, setSelectedDocumentId } = useSelectedDocument();
  const { documents, loading, error, fetchDocuments, removeDocument } = useDocuments();
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const handleUploadSuccess = useCallback((docId: string, filename: string) => {
    setShowUpload(false);
    fetchDocuments();
  }, [fetchDocuments]);

  const handleDelete = async (documentId: string) => {
    if (!confirm(`Delete "${documentId}"? This will remove the document and its vectors from Qdrant.`)) return;

    setDeletingId(documentId);
    try {
      await api.deleteDocument(documentId);
      removeDocument(documentId);
      if (selectedDocumentId === documentId) {
        setSelectedDocumentId(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete document.");
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Document Library</h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Manage your uploaded documents. Select a document to ask questions in Research.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={fetchDocuments} disabled={loading} size="sm">
            <RefreshIcon className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={() => setShowUpload(true)} size="sm">
            <DocumentIcon className="h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowUpload(false)}>
          <div className="bg-[var(--color-bg-elevated)] rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <UploadArea onSuccess={handleUploadSuccess} />
            <div className="p-4 border-t border-[var(--color-border)] flex justify-end">
              <Button variant="ghost" onClick={() => setShowUpload(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <Card className="border-[var(--color-error-border)] bg-[var(--color-error-light)]">
          <CardContent className="py-4">
            <div className="flex items-center gap-3 text-[var(--color-error)]">
              <AlertCircleIcon className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={fetchDocuments} className="ml-auto">Retry</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <DocumentIcon className="h-5 w-5 text-[var(--color-accent)]" />
              Documents ({documents.length})
            </CardTitle>
            <Input
              placeholder="Search by filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="h-8 w-8 text-[var(--color-accent)] animate-spin" />
              <span className="ml-3 text-[var(--color-text-muted)]">Loading documents...</span>
            </div>
          )}

          {!loading && filteredDocuments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <DocumentIcon className="h-16 w-16 text-[var(--color-text-subtle)] mb-4" />
              <h3 className="text-lg font-medium text-[var(--color-text)] mb-1">
                {searchQuery ? "No matching documents" : "No documents yet"}
              </h3>
              <p className="text-[var(--color-text-muted)] mb-4">
                {searchQuery
                  ? `No documents found matching "${searchQuery}"`
                  : "Upload your first PDF document to get started."}
              </p>
              {!searchQuery && (
                <Button onClick={() => setShowUpload(true)}>
                  <DocumentIcon className="h-4 w-4" />
                  Upload Document
                </Button>
              )}
            </div>
          )}

          {!loading && filteredDocuments.length > 0 && (
            <div className="divide-y divide-[var(--color-border)]">
              {filteredDocuments.map((doc) => (
                <DocumentRow
                  key={doc.documentId}
                  document={doc}
                  onSelect={() => navigate(`/?documentId=${encodeURIComponent(doc.documentId)}`)}
                  onDelete={handleDelete}
                  deleting={deletingId === doc.documentId}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentRow({ document, onSelect, onDelete, deleting }: { document: Document; onSelect: () => void; onDelete: (id: string) => void; deleting: boolean }) {
  return (
    <div className="p-4 hover:bg-[var(--color-border)]/30 transition-colors">
      <div className="flex items-start gap-4">
        <button type="button" className="flex flex-1 items-start gap-4 min-w-0 text-left" onClick={onSelect}>
          <DocumentIcon className="h-10 w-10 text-[var(--color-accent)] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium text-[var(--color-text)] truncate">{document.filename}</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <StatusIndicator status={document.status} />
                {deleting && <LoaderIcon className="h-4 w-4 animate-spin text-[var(--color-accent)]" />}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-4 mt-2 text-sm text-[var(--color-text-muted)]">
              <span className="font-mono text-xs">{document.documentId}</span>
              <span>Source: {document.source}</span>
              <span><span className="font-mono">{document.chunkCount}</span> chunks</span>
              <span>{formatFileSize(document.sizeBytes)}</span>
              <span>{formatDate(document.createdAt)}</span>
              {document.errorMessage && (
                <span className="flex items-center gap-1 text-[var(--color-error)]">
                  <AlertCircleIcon className="h-3 w-3" />
                  {document.errorMessage}
                </span>
              )}
            </span>
          </span>
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(document.documentId)}
          disabled={deleting}
          className="flex-shrink-0"
          aria-label={`Delete ${document.filename}`}
        >
          <TrashIcon className="h-4 w-4 text-[var(--color-error)]" />
        </Button>
      </div>
    </div>
  );
}