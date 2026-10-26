import { useState } from "react";
import {
  BrainCircuit,
  Check,
  CircleHelp,
  Combine,
  FileStack,
  Database,
  FileSearch,
  GitMerge,
  Layers3,
  ListFilter,
  LoaderCircle,
  MessageSquareText,
  Search,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useDocuments } from "../hooks/useDocuments";
import { useSelectedDocument } from "../hooks/useSelectedDocument";
import { api, type AnswerResponse, type PipelineResultItem, type PipelineTrace } from "../api";
import type { Source } from "../api/types";
import { Card, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Textarea } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { cn } from "../utils";
import { useResearchStatus } from "../context/ResearchStatusContext";

const pipelineStages = [
  {
    id: "question",
    step: "01",
    title: "Question",
    detail: "Original query is preserved for the final answer.",
    technology: "User input",
    icon: MessageSquareText,
  },
  {
    id: "rewrite",
    step: "02",
    title: "Query rewrite",
    detail: "Rewrites the query as a standalone search question.",
    technology: "LLM rewrite",
    icon: WandSparkles,
  },
  {
    id: "decompose",
    step: "03",
    title: "Decomposition",
    detail: "Splits multi-part queries into up to four focused questions.",
    technology: "LLM decomposition",
    icon: Layers3,
  },
  {
    id: "hyde",
    step: "04",
    title: "HyDE",
    detail: "Creates a hypothetical passage and embeds it for dense search.",
    technology: "Hypothetical document embedding",
    icon: WandSparkles,
  },
  {
    id: "dense",
    step: "05A",
    title: "Dense search",
    detail: "Finds semantic matches for each decomposed query.",
    technology: "Embeddings · Qdrant",
    icon: Database,
  },
  {
    id: "bm25",
    step: "05B",
    title: "BM25 search",
    detail: "Finds lexical matches in the same document for each sub-query.",
    technology: "Keyword ranking · BM25",
    icon: Search,
  },
  {
    id: "rrf",
    step: "06",
    title: "RRF fusion",
    detail: "Combines dense and keyword rankings into a unified candidate list.",
    technology: "Reciprocal rank · k=60",
    icon: GitMerge,
  },
  {
    id: "hydrate",
    step: "07",
    title: "Load candidates",
    detail: "Fetches fused Qdrant points with their text and source metadata.",
    technology: "Qdrant payloads",
    icon: Database,
  },
  {
    id: "rerank",
    step: "08",
    title: "Cross-encoder rerank",
    detail: "Scores and reorders fused passages for query relevance.",
    technology: "Cross-encoder",
    icon: ListFilter,
  },
  {
    id: "merge",
    step: "09",
    title: "Merge sub-query results",
    detail: "Deduplicates chunk IDs and keeps each chunk's best reranker score.",
    technology: "Top-K evidence",
    icon: Combine,
  },
  {
    id: "context",
    step: "10",
    title: "Build evidence context",
    detail: "Deduplicates repeated sentences and keeps source/chunk labels.",
    technology: "Source-preserving preparation",
    icon: FileSearch,
  },
  {
    id: "compression",
    step: "11",
    title: "Context compression",
    detail: "Extracts question-relevant evidence before answer generation.",
    technology: "LLM compression · fallback to original context",
    icon: FileStack,
  },
  {
    id: "abstention",
    step: "12",
    title: "Evidence check",
    detail: "Returns an insufficient-evidence response if results or context are empty.",
    technology: "Abstention guard",
    icon: CircleHelp,
  },
  {
    id: "answer",
    step: "13",
    title: "Grounded answer",
    detail: "Answers the original question with citations from retrieved evidence.",
    technology: "LLM generation · source metadata",
    icon: BrainCircuit,
  },
] as const;

export function ExplorerPage() {
  const { documents } = useDocuments();
  const { selectedDocumentId: documentId, setSelectedDocumentId } = useSelectedDocument();
  const { hydeEnabled: useHyde, setHydeEnabled: setUseHyde } = useResearchStatus();
  const selectedDocument = documents.find((document) => document.documentId === documentId);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AnswerResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestDurationMs, setRequestDurationMs] = useState<number | null>(null);
  const [expandedStages, setExpandedStages] = useState<string[]>([]);

  const runPipeline = async () => {
    const submittedQuestion = question.trim();
    if (
      submittedQuestion.length < 3 ||
      !documentId ||
      selectedDocument?.status !== "ready" ||
      running
    ) {
      return;
    }

    setRunning(true);
    setError(null);
    setAnswer(null);
    setRequestDurationMs(null);

    const startTime = Date.now();

    try {
      const response = await api.answerQuestion({
        question: submittedQuestion,
        document_id: documentId,
        limit: 3,
        score_threshold: 0.4,
        use_hyde: useHyde,
      });

      setAnswer(response);
      setExpandedStages([
        "rewrite",
        "decompose",
        "hyde",
        "dense",
        "bm25",
        "rrf",
        "rerank",
        "context",
        "compression",
      ]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pipeline execution failed");
    } finally {
      setRequestDurationMs(Date.now() - startTime);
      setRunning(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void runPipeline();
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-600 dark:text-cyan-300">
              <Sparkles className="h-4 w-4" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
              Retrieval intelligence
            </p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            RAG Pipeline Explorer
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--color-text-muted)]">
            Follow a question through rewrite, hybrid retrieval, ranking, and evidence-grounded generation.
          </p>
        </div>
        {answer && (
          <Badge variant={answer.retrieved_chunks > 0 ? "success" : "warning"}>
            {answer.retrieved_chunks > 0 ? "Run complete" : "No evidence found"}
          </Badge>
        )}
      </header>

      <Card className="overflow-hidden border-[var(--color-border)]">
        <CardContent className="grid gap-3 p-3 sm:grid-cols-[minmax(180px,0.8fr)_minmax(260px,2fr)_minmax(160px,0.8fr)_auto] sm:items-end">
          <div>
            <label
              htmlFor="pipeline-document"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
            >
              Source document
            </label>
            <select
              id="pipeline-document"
              value={documentId ?? ""}
              onChange={(event) => setSelectedDocumentId(event.target.value || null)}
              disabled={running}
              className="h-[42px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
            >
              <option value="">Select a document...</option>
              {documents.map((document) => (
                <option
                  key={document.documentId}
                  value={document.documentId}
                  disabled={document.status !== "ready"}
                >
                  {document.filename} · {document.status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="pipeline-question"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
            >
              Ask the pipeline
            </label>
            <Textarea
              id="pipeline-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about the selected document..."
              rows={1}
              disabled={running}
              aria-label="Question to run through the RAG pipeline"
              className="min-h-[42px] rounded-xl py-2.5"
            />
          </div>

          <label
            htmlFor="pipeline-hyde"
            className="flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 transition-colors hover:border-[var(--color-accent-border)]"
          >
            <input
              id="pipeline-hyde"
              type="checkbox"
              checked={useHyde}
              onChange={(event) => setUseHyde(event.target.checked)}
              disabled={running}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[var(--color-text)]">HyDE</span>
              <span className="block text-[10px] leading-4 text-[var(--color-text-muted)]">
                {useHyde ? "Enabled · extra LLM call" : "Disabled · standard query vector"}
              </span>
            </span>
          </label>

          <Button
            onClick={() => void runPipeline()}
            disabled={question.trim().length < 3 || selectedDocument?.status !== "ready" || running}
            className="h-[42px] w-full sm:w-auto"
          >
            {running ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Running
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Run pipeline
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {running && (
        <div className="flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs text-[var(--color-text-muted)]">
          <LoaderCircle className="h-4 w-4 animate-spin text-[var(--color-accent)]" />
          Executing rewrite, retrieval, ranking, and answer generation. Stage outputs will appear from the backend response.
        </div>
      )}

      {error && (
        <div
          className="rounded-xl border border-[var(--color-error-border)] bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]"
          role="alert"
        >
          {error}
        </div>
      )}

      <section aria-labelledby="pipeline-map-title">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="pipeline-map-title" className="text-sm font-semibold text-[var(--color-text)]">
              Query-to-answer flow
            </h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              HyDE is optional; dense + BM25 run per sub-query before fusion, reranking, and context preparation.
            </p>
          </div>
          <span className="text-[11px] text-[var(--color-text-subtle)]">
            {answer?.pipeline ? "Captured backend trace" : "Pipeline overview"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" role="list" aria-label="RAG pipeline stages">
          {pipelineStages.map((stage, index) => (
            <PipelineStageTile
              key={stage.id}
              stage={stage}
              trace={answer?.pipeline}
              answer={answer}
              index={index}
              expanded={expandedStages.includes(stage.id)}
              onToggle={() =>
                setExpandedStages((current) =>
                  current.includes(stage.id)
                    ? current.filter((id) => id !== stage.id)
                    : [...current, stage.id]
                )
              }
            />
          ))}
        </div>
      </section>

      {answer && (
        <section className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,0.8fr)]" aria-label="Pipeline results">
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-[var(--color-accent)]" />
                  <h2 className="text-sm font-semibold text-[var(--color-text)]">Grounded answer</h2>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="info">{answer.retrieved_chunks} chunks</Badge>
                  {requestDurationMs !== null && (
                    <Badge variant="default">{requestDurationMs} ms total</Badge>
                  )}
                </div>
              </div>
              <p className="max-h-36 overflow-auto whitespace-pre-wrap text-sm leading-6 text-[var(--color-text)]">
                {answer.answer}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-[var(--color-accent)]" />
                <h2 className="text-sm font-semibold text-[var(--color-text)]">Final evidence</h2>
              </div>
              {answer.sources.length > 0 ? (
                <div className="max-h-36 space-y-1.5 overflow-auto">
                  {answer.sources.map((source, index) => (
                    <SourceRow key={`${source.source}-${source.chunk_index}-${index}`} source={source} rank={index + 1} />
                  ))}
                </div>
              ) : (
                <p className="flex items-start gap-2 text-xs leading-5 text-[var(--color-text-muted)]">
                  <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  No evidence was returned, so context construction and answer generation were skipped.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <p className="text-[11px] leading-5 text-[var(--color-text-subtle)]">
        Stage outputs and timings are captured from the answer request. The API does not stream intermediate events,
        so the trace is revealed after the completed backend response rather than presented as live progress.
      </p>
    </div>
  );
}

function PipelineStageTile({
  stage,
  trace,
  answer,
  index,
  expanded,
  onToggle,
}: {
  stage: (typeof pipelineStages)[number];
  trace?: PipelineTrace;
  answer: AnswerResponse | null;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = stage.icon;
  const output = getStageOutput(stage.id, trace, answer);
  const summary = getStageSummary(stage.id, trace, answer);
  const duration = getStageDuration(stage.id, trace);
  const hasTrace = output !== null;

  return (
    <article
      role="listitem"
      className={cn(
        "pipeline-trace-card group relative flex min-h-[108px] flex-col rounded-xl border bg-[var(--color-bg-elevated)] p-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:min-h-[116px] sm:p-3",
        hasTrace ? "border-emerald-500/30" : "border-[var(--color-border)]"
      )}
      style={hasTrace ? { animationDelay: `${Math.min(index * 55, 550)}ms` } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex flex-1 flex-col text-left"
      >
      <div className="mb-2 flex w-full items-center justify-between">
        <span className="font-mono text-[10px] font-semibold tracking-wider text-[var(--color-text-subtle)]">
          {stage.step}
        </span>
        <span className={cn(
          "flex h-7 w-7 items-center justify-center rounded-lg",
          hasTrace
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
            : "bg-[var(--color-accent-light)] text-[var(--color-accent)]"
        )}>
          {hasTrace ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
      </div>
      <h3 className="w-full text-xs font-semibold leading-4 text-[var(--color-text)]">{stage.title}</h3>
      <p className="mt-1 line-clamp-2 w-full text-[11px] leading-4 text-[var(--color-text-muted)]">{stage.detail}</p>
      {summary && (
        <p className="mt-1 line-clamp-2 w-full text-[10px] leading-4 text-emerald-700 dark:text-emerald-300">
          {summary}
        </p>
      )}
      <div className="mt-auto flex w-full items-center justify-between gap-1 pt-2">
        <span className="truncate font-mono text-[9px] text-[var(--color-text-subtle)]">
          {duration === null ? stage.technology : `${duration.toFixed(1)} ms`}
        </span>
        <span className="shrink-0 text-[9px] text-[var(--color-text-subtle)]">
          {hasTrace ? (expanded ? "Hide" : "Output") : "Waiting"}
        </span>
      </div>
      </button>
      {hasTrace && expanded && (
        <div className="pipeline-output-reveal mt-2 border-t border-[var(--color-border)] pt-2">
          {output}
        </div>
      )}
    </article>
  );
}

function getStageDuration(stageId: string, trace?: PipelineTrace): number | null {
  if (!trace) return null;
  if (stageId === "rewrite") return trace.rewriting?.duration_ms ?? null;
  if (stageId === "decompose") return trace.decomposition?.duration_ms ?? null;
  if (stageId === "hyde") {
    return trace.retrieval_queries?.reduce(
      (sum, query) => sum + (query.hyde?.duration_ms ?? 0),
      0
    ) ?? null;
  }
  if (["dense", "bm25", "rrf", "hydrate", "rerank"].includes(stageId)) {
    const durations = trace.retrieval_queries?.map((query) => {
      switch (stageId) {
        case "dense": return query.dense.duration_ms;
        case "bm25": return query.bm25.duration_ms;
        case "rrf": return query.rrf.duration_ms;
        case "hydrate": return query.hydrate?.duration_ms ?? 0;
        case "rerank": return query.rerank.duration_ms;
        default: return 0;
      }
    });
    return durations?.reduce((sum, duration) => sum + duration, 0) ?? null;
  }
  if (stageId === "context") return trace.context?.duration_ms ?? null;
  if (stageId === "compression") return trace.compression?.duration_ms ?? null;
  if (stageId === "answer") return trace.generation?.duration_ms ?? null;
  return null;
}

function getStageSummary(
  stageId: string,
  trace?: PipelineTrace,
  answer?: AnswerResponse | null
): string | null {
  if (!trace) return null;
  const queries = trace.retrieval_queries ?? [];

  switch (stageId) {
    case "question":
      return trace.question ? "Original query captured" : null;
    case "rewrite":
      return trace.rewriting ? `Output: ${trace.rewriting.rewritten_query}` : null;
    case "decompose":
      return trace.decomposition ? `${trace.decomposition.queries.length} ${trace.decomposition.queries.length === 1 ? "search query" : "search queries"}` : null;
    case "hyde": {
      const hydeRuns = queries.flatMap((query) =>
        query.hyde?.enabled ? [query.hyde] : []
      );
      if (trace.use_hyde === false) return "Disabled for this run";
      if (hydeRuns.length === 0) return "No sub-query required HyDE";
      const embedded = hydeRuns.filter((hyde) => hyde.embedding_used).length;
      return `${embedded}/${hydeRuns.length} hypothetical vectors used`;
    }
    case "dense":
      return `${queries.reduce((sum, query) => sum + query.dense.results.length, 0)} semantic matches`;
    case "bm25":
      return `${queries.reduce((sum, query) => sum + query.bm25.results.length, 0)} keyword matches`;
    case "rrf":
      return `${queries.reduce((sum, query) => sum + query.rrf.candidate_count, 0)} fused candidates`;
    case "hydrate":
      return `${queries.reduce((sum, query) => sum + (query.hydrate?.candidate_count ?? 0), 0)} candidates loaded`;
    case "rerank":
      return `${queries.reduce((sum, query) => sum + query.rerank.results.length, 0)} passages reranked`;
    case "merge":
      return `${trace.merged?.length ?? 0} unique top chunks`;
    case "context":
      return trace.context ? `${trace.context.characters.toLocaleString()} context characters` : null;
    case "compression":
      return trace.compression
        ? `${trace.compression.input_characters.toLocaleString()} → ${trace.compression.output_characters.toLocaleString()} characters`
        : null;
    case "abstention":
      return answer ? answer.retrieved_chunks > 0 ? "Evidence available" : "Abstention returned" : null;
    case "answer":
      return answer ? `${answer.retrieved_chunks} cited evidence chunks` : null;
    default:
      return null;
  }
}

function getStageOutput(
  stageId: string,
  trace: PipelineTrace | undefined,
  answer: AnswerResponse | null
): React.ReactNode | null {
  if (!trace) return null;

  if (stageId === "question" && trace.question) {
    return <TraceText label="Original query" value={trace.question} />;
  }
  if (stageId === "rewrite" && trace.rewriting) {
    return (
      <div className="space-y-2">
        <TraceText label="Original" value={trace.rewriting.original_query} />
        <TraceText label="Rewritten" value={trace.rewriting.rewritten_query} />
      </div>
    );
  }
  if (stageId === "decompose" && trace.decomposition) {
    return (
      <div className="space-y-1.5">
        {trace.decomposition.queries.map((query, index) => (
          <div key={`${query}-${index}`} className="rounded-lg bg-[var(--color-bg)] px-2 py-1.5 text-[10px] leading-4 text-[var(--color-text)]">
            <span className="mr-1 font-mono text-[var(--color-accent)]">{index + 1}.</span>{query}
          </div>
        ))}
        <p className="text-[9px] text-[var(--color-text-subtle)]">
          {trace.decomposition.queries.length} search {trace.decomposition.queries.length === 1 ? "query" : "queries"}
        </p>
      </div>
    );
  }
  if (stageId === "hyde") {
    const queries = trace.retrieval_queries ?? [];
    return (
      <div className="max-h-52 space-y-2 overflow-auto">
        {queries.map((query, index) => {
          const hyde = query.hyde;
          return (
            <div key={`${query.query}-${index}`} className="rounded-lg bg-[var(--color-bg)] p-2">
              <p className="mb-1 truncate text-[9px] font-medium text-[var(--color-text-muted)]">{query.query}</p>
              {!hyde?.enabled ? (
                <p className="text-[10px] text-[var(--color-text-subtle)]">HyDE disabled; dense search embeds the query.</p>
              ) : hyde.embedding_used ? (
                <>
                  <p className="mb-1 text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
                    Hypothetical passage embedded · {hyde.duration_ms.toFixed(1)} ms
                  </p>
                  <p className="text-[10px] leading-4 text-[var(--color-text)]">{hyde.preview}</p>
                </>
              ) : (
                <p className="text-[10px] text-amber-700 dark:text-amber-300">
                  {hyde.embedding_fallback
                    ? "Could not embed the hypothetical passage; standard query embedding was used."
                    : "No hypothetical passage returned; standard query embedding was used."}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  if (stageId === "dense" || stageId === "bm25" || stageId === "rrf" || stageId === "hydrate" || stageId === "rerank") {
    const entries = trace.retrieval_queries ?? [];
    return (
      <div className="max-h-52 space-y-2 overflow-auto">
        {entries.map((entry, index) => {
          const results = stageId === "dense"
            ? entry.dense.results
            : stageId === "bm25"
              ? entry.bm25.results
              : stageId === "rrf"
                ? entry.rrf.results
                : stageId === "rerank"
                  ? entry.rerank.results
                  : [];
          const itemCount = stageId === "hydrate"
            ? entry.hydrate?.candidate_count ?? 0
            : results.length;
          return (
            <div key={`${entry.query}-${index}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="truncate text-[9px] font-medium text-[var(--color-text-muted)]">{entry.query}</p>
                <span className="shrink-0 text-[9px] text-[var(--color-text-subtle)]">
                  {stageId === "hydrate" ? `${itemCount} loaded` : `${itemCount} results`}
                </span>
              </div>
              {results.length > 0 ? (
                <TraceResultList items={results.slice(0, 5)} />
              ) : (
                <p className="rounded-md bg-[var(--color-bg)] px-2 py-1 text-[9px] text-[var(--color-text-subtle)]">
                  {stageId === "hydrate" ? "Candidate payloads loaded for reranking." : "No candidates returned."}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  if (stageId === "merge" && trace.merged) {
    return (
      <div className="space-y-1.5">
        <p className="text-[9px] text-[var(--color-text-subtle)]">{trace.merged.length} unique final candidates</p>
        <TraceResultList items={trace.merged} />
      </div>
    );
  }
  if (stageId === "context" && trace.context) {
    return (
      <div className="space-y-1.5 text-[10px] text-[var(--color-text-muted)]">
        <p>{trace.context.characters.toLocaleString()} characters passed to generation.</p>
        {trace.context.sources.map((source, index) => (
          <p key={`${source.source}-${source.chunk_index}-${index}`} className="truncate">
            {source.source} · chunk {source.chunk_index}
          </p>
        ))}
      </div>
    );
  }
  if (stageId === "compression" && trace.compression) {
    const compression = trace.compression;
    const savedCharacters = compression.input_characters - compression.output_characters;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={
            compression.status === "compressed"
              ? "success"
              : compression.status === "fallback"
                ? "warning"
                : "default"
          }>
            {compression.status === "compressed"
              ? "Compressed"
              : compression.status === "fallback"
                ? "Original context retained"
                : "Skipped"}
          </Badge>
          <Badge variant="default">
            {compression.input_characters.toLocaleString()} → {compression.output_characters.toLocaleString()} chars
          </Badge>
          {compression.status === "compressed" && savedCharacters > 0 && (
            <Badge variant="info">{savedCharacters.toLocaleString()} chars reduced</Badge>
          )}
        </div>
        <p className="break-words whitespace-pre-wrap text-[10px] leading-4 text-[var(--color-text-muted)]">
          {compression.preview || "No context text was passed through compression."}
        </p>
        {compression.status === "fallback" && (
          <p className="text-[9px] leading-4 text-amber-700 dark:text-amber-300">
            Compression returned no usable text or failed, so the original retrieved context was kept.
          </p>
        )}
      </div>
    );
  }
  if (stageId === "abstention" && answer) {
    return (
      <p className="text-[10px] leading-4 text-[var(--color-text-muted)]">
        {answer.retrieved_chunks > 0
          ? `Evidence present (${answer.retrieved_chunks} final chunks); answer generation continued.`
          : "No usable evidence; the service returned its abstention response."}
      </p>
    );
  }
  if (stageId === "answer" && answer) {
    return (
      <p className="line-clamp-5 whitespace-pre-wrap text-[10px] leading-4 text-[var(--color-text-muted)]">
        {answer.answer}
      </p>
    );
  }
  return null;
}

function TraceText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">{label}</p>
      <p className="text-[10px] leading-4 text-[var(--color-text)]">{value}</p>
    </div>
  );
}

function TraceResultList({ items }: { items: PipelineResultItem[] }) {
  if (items.length === 0) {
    return <p className="text-[9px] text-[var(--color-text-subtle)]">No candidates returned.</p>;
  }

  return (
    <div className="space-y-1">
      {items.map((item, index) => (
        <div key={`${item.id}-${index}`} className="rounded-md bg-[var(--color-bg)] px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[9px] font-medium text-[var(--color-text)]">
              #{index + 1} {item.source} · chunk {item.chunk_index}
            </span>
            <span className="shrink-0 font-mono text-[9px] text-[var(--color-accent)]">{item.score.toFixed(4)}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[9px] leading-3 text-[var(--color-text-muted)]">{item.preview}</p>
        </div>
      ))}
    </div>
  );
}

function SourceRow({ source, rank }: { source: Source; rank: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[10px] font-semibold text-[var(--color-accent)]">
          {rank}
        </span>
        <span className="truncate text-xs font-medium text-[var(--color-text)]">{source.source}</span>
        <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">chunk {source.chunk_index}</span>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-muted)]">{source.score.toFixed(3)}</span>
    </div>
  );
}
