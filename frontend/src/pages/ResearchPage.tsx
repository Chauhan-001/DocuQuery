import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpenText,
  Check,
  FileText,
  Link2,
  UploadCloud,
} from "lucide-react";
import { useDocuments } from "../hooks/useDocuments";
import { useSelectedDocument } from "../hooks/useSelectedDocument";
import { UploadArea } from "../components/UploadArea";
import { QAInterface, type QAResult } from "../components/QAInterface";
import { Card } from "../components/ui/Card";
import { StatusIndicator } from "../components/ui/Badge";
import { cn } from "../utils/cn";

export function ResearchPage() {
  const { selectedDocumentId, setSelectedDocumentId } = useSelectedDocument();
  const { documents, loading, error, fetchDocuments } = useDocuments();
  const [latestResult, setLatestResult] = useState<QAResult | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  const [evidenceExpanded, setEvidenceExpanded] = useState(true);

  const selectedDocument = documents.find((document) => document.documentId === selectedDocumentId);
  const recentDocuments = useMemo(() => documents.slice(0, 5), [documents]);

  const handleUploadSuccess = useCallback(async (documentId: string) => {
    await fetchDocuments();
    setSelectedDocumentId(documentId);
  }, [fetchDocuments, setSelectedDocumentId]);

  const handleResult = useCallback((result: QAResult | null) => {
    setLatestResult(result);
    setSelectedEvidence(null);
  }, []);

  const handleEvidenceNavigate = useCallback((source: string, chunkIndex: number) => {
    const key = `${source}:${chunkIndex}`;
    setEvidenceExpanded(true);
    setSelectedEvidence(key);
    window.requestAnimationFrame(() => {
      document.getElementById(`evidence-${encodeEvidenceId(source, chunkIndex)}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  return (
    <div className="research-page mx-auto w-full max-w-[1700px] space-y-4">
      <section className="research-hero overflow-hidden rounded-2xl border border-[var(--color-border)] px-5 py-5 sm:px-6 sm:py-6">
        <div className="relative z-10 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/[0.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.17em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(32,230,160,0.7)]" />
              Research workspace
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)] sm:text-3xl">
              Research Workspace
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-text-muted)]">
              Upload documents, ask questions, and get evidence-based answers grounded in your content.
            </p>
          </div>

          <div className="min-w-0 xl:w-[47%]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <BookOpenText className="h-4 w-4 text-emerald-300" />
                Recent files
              </div>
              {documents.length > 0 && (
                <Link
                  to={`/documents${selectedDocumentId ? `?documentId=${encodeURIComponent(selectedDocumentId)}` : ""}`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300 transition-colors hover:text-emerald-200"
                >
                  View all <ArrowUpRight className="h-3 w-3" />
                </Link>
              )}
            </div>
            {recentDocuments.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recentDocuments.map((document) => (
                  <button
                    key={document.documentId}
                    type="button"
                    onClick={() => setSelectedDocumentId(document.documentId)}
                    aria-pressed={selectedDocumentId === document.documentId}
                    className={cn(
                      "recent-file-card flex min-w-[170px] max-w-[220px] flex-1 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                      selectedDocumentId === document.documentId
                        ? "border-emerald-400/50 bg-emerald-400/[0.09] shadow-[0_0_22px_rgba(32,230,160,0.07)]"
                        : "border-white/[0.08] bg-slate-950/35 hover:border-emerald-400/25 hover:bg-white/[0.04]"
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-400/15 bg-emerald-400/[0.08] text-emerald-300">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-slate-100">{document.filename}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">{document.chunkCount} chunks</span>
                    </span>
                    {selectedDocumentId === document.documentId && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 bg-slate-950/25 px-3 py-3 text-xs text-slate-400">
                Your uploaded documents will appear here.
              </p>
            )}
          </div>
        </div>
      </section>

      {(error || loading) && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
            error
              ? "border-rose-400/25 bg-rose-400/[0.06] text-rose-200"
              : "border-sky-400/20 bg-sky-400/[0.05] text-sky-100"
          )}
          role={error ? "alert" : "status"}
        >
          {error ?? "Loading your document library…"}
          {error && (
            <button type="button" className="ml-auto underline underline-offset-2" onClick={() => void fetchDocuments()}>
              Retry
            </button>
          )}
        </div>
      )}

      <div className="research-workspace-grid grid items-start gap-4 md:grid-cols-[minmax(205px,0.78fr)_minmax(0,1.55fr)] xl:grid-cols-[minmax(235px,0.78fr)_minmax(390px,1.55fr)_minmax(265px,0.9fr)]">
        <aside className="space-y-4">
          <UploadArea onSuccess={handleUploadSuccess} />
          <Card className="research-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                <BookOpenText className="h-4 w-4 text-emerald-300" />
                Recent documents
              </h2>
              <Link to="/documents" className="text-[10px] font-medium text-emerald-300 hover:text-emerald-200">
                View all
              </Link>
            </div>
            <div className="space-y-1.5 p-2.5">
              {recentDocuments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--color-border)] px-3 py-5 text-center">
                  <UploadCloud className="mx-auto mb-2 h-5 w-5 text-[var(--color-text-subtle)]" />
                  <p className="text-xs text-[var(--color-text-muted)]">No documents uploaded yet.</p>
                </div>
              ) : recentDocuments.map((document) => (
                <button
                  key={document.documentId}
                  type="button"
                  onClick={() => setSelectedDocumentId(document.documentId)}
                  aria-pressed={selectedDocumentId === document.documentId}
                  className={cn(
                    "document-row flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all",
                    selectedDocumentId === document.documentId
                      ? "border-emerald-400/35 bg-emerald-400/[0.07]"
                      : "border-transparent hover:border-[var(--color-border)] hover:bg-white/[0.025]"
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-950/45 text-emerald-300">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-slate-100">{document.filename}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                      {document.chunkCount} chunks · {new Date(document.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                  <StatusIndicator status={document.status} />
                </button>
              ))}
            </div>
          </Card>
        </aside>

        <QAInterface
          documentId={selectedDocumentId}
          documentName={selectedDocument?.filename}
          documentStatus={selectedDocument?.status}
          onResult={handleResult}
          onEvidenceNavigate={handleEvidenceNavigate}
        />

        <EvidencePanel
          result={latestResult}
          expanded={evidenceExpanded}
          selectedEvidence={selectedEvidence}
          onToggle={() => setEvidenceExpanded((expanded) => !expanded)}
          onSelect={handleEvidenceNavigate}
        />
      </div>
    </div>
  );
}

function EvidencePanel({
  result,
  expanded,
  selectedEvidence,
  onToggle,
  onSelect,
}: {
  result: QAResult | null;
  expanded: boolean;
  selectedEvidence: string | null;
  onToggle: () => void;
  onSelect: (source: string, chunkIndex: number) => void;
}) {
  const sources = result?.answer.sources ?? [];
  const passages = result?.evidence ?? [];

  return (
    <Card className="research-panel evidence-panel overflow-hidden md:col-span-2 xl:col-span-1 xl:sticky xl:top-[76px]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
          <Link2 className="h-4 w-4 text-emerald-300" />
          Evidence
          {sources.length > 0 && (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-1.5 py-0.5 text-[9px] font-medium text-emerald-200">
              {sources.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="rounded-lg px-2 py-1 text-[10px] font-medium text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-emerald-200"
        >
          {expanded ? "Hide" : "Show"}
        </button>
      </div>

      {expanded && (
        <div className="space-y-2.5 p-3">
          {result && sources.length > 0 ? (
            sources.map((source, index) => {
              const matchingPassage = passages.find(
                (passage) => passage.source === source.source && passage.chunk_index === source.chunk_index
              );
              const key = `${source.source}:${source.chunk_index}`;
              return (
                <button
                  id={`evidence-${encodeEvidenceId(source.source, source.chunk_index)}`}
                  key={`${key}-${index}`}
                  type="button"
                  onClick={() => onSelect(source.source, source.chunk_index)}
                  aria-pressed={selectedEvidence === key}
                  className={cn(
                    "evidence-card w-full rounded-xl border p-3 text-left transition-all",
                    selectedEvidence === key
                      ? "border-emerald-300/55 bg-emerald-400/[0.09] shadow-[0_0_24px_rgba(32,230,160,0.09)]"
                      : "border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-emerald-400/30"
                  )}
                >
                  <span className="mb-2 flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-[10px] font-semibold text-emerald-300">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-100">{source.source}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  </span>
                  <span className="mb-2 flex flex-wrap gap-1.5">
                    <span className="rounded-md border border-white/[0.07] bg-slate-950/35 px-1.5 py-0.5 text-[9px] text-slate-300">
                      Chunk {source.chunk_index}
                    </span>
                    <span className="rounded-md border border-emerald-400/15 bg-emerald-400/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-emerald-200">
                      Score {source.score.toFixed(4)}
                    </span>
                  </span>
                  <span className="block line-clamp-5 whitespace-pre-wrap text-[11px] leading-5 text-slate-400">
                    {matchingPassage?.text || "Source and chunk metadata were returned; passage preview is not available in this response."}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-slate-950/20 px-4 py-6 text-center">
              <div className="evidence-mark mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300">
                <BookOpenText className="h-5 w-5" />
              </div>
              <p className="text-xs font-medium text-slate-200">
                {result ? "No evidence found" : "Evidence-based answers"}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">
                {result ? "Try rephrasing your question or selecting a different document." : "Every response is grounded in your documents."}
              </p>
            </div>
          )}
          <p className="border-t border-[var(--color-border)] pt-2 text-[9px] leading-4 text-slate-500">
            Scores are retrieval/reranker scores, not probabilities or confidence estimates.
          </p>
        </div>
      )}
    </Card>
  );
}

function encodeEvidenceId(source: string, chunkIndex: number) {
  return `${encodeURIComponent(source)}-${chunkIndex}`;
}
