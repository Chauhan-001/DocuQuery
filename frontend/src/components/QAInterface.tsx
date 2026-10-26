import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Check, Copy, Link2, Sparkles } from "lucide-react";
import { useQA } from "../hooks/useDocuments";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/Input";
import { Card, CardContent } from "./ui/Card";
import { Badge, StatusIndicator } from "./ui/Badge";
import { AlertCircleIcon, LoaderIcon } from "./icons";
import { useResearchStatus } from "../context/ResearchStatusContext";
import type { AnswerResponse, Document, RetrievalChunk } from "../api/types";

export interface QAResult {
  question: string;
  answer: AnswerResponse;
  evidence: RetrievalChunk[];
}

interface QAInterfaceProps {
  documentId: string | null;
  documentName?: string;
  documentStatus?: Document["status"];
  onResult: (result: QAResult | null) => void;
  onEvidenceNavigate: (source: string, chunkIndex: number) => void;
}

export function QAInterface({
  documentId,
  documentName,
  documentStatus,
  onResult,
  onEvidenceNavigate,
}: QAInterfaceProps) {
  const [question, setQuestion] = useState("");
  const [latestQuestion, setLatestQuestion] = useState("");
  const [lastAnswer, setLastAnswer] = useState<AnswerResponse | null>(null);
  const [copied, setCopied] = useState<"answer" | "code" | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const { ask, answering, error, setError } = useQA();
  const { setStatus } = useResearchStatus();

  useEffect(() => {
    setLastAnswer(null);
    setLatestQuestion("");
    setCopied(null);
    setClipboardError(null);
    setError(null);
    onResult(null);
    setStatus({
      mode: "idle",
      detail: documentId ? "Ready to research." : "Select a document to begin.",
      lastQuestion: null,
    });
  }, [documentId, onResult, setError, setStatus]);

  useEffect(() => {
    const el = conversationRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [latestQuestion, lastAnswer, answering]);

  const copyText = async (text: string, target: "answer" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(target);
      setClipboardError(null);
      window.setTimeout(() => setCopied((current) => (current === target ? null : current)), 1500);
    } catch {
      setClipboardError("Clipboard access failed. You can still copy the text manually.");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 3 || !documentId || answering || documentStatus !== "ready") return;

    const submittedQuestion = question.trim();
    setLatestQuestion(submittedQuestion);
    setLastAnswer(null);
    setCopied(null);
    setClipboardError(null);
    onResult(null);
    setStatus({
      mode: "researching",
      detail: "Research request is running against the selected document.",
      lastQuestion: submittedQuestion,
    });

    try {
      const response = await ask({
        question: submittedQuestion,
        document_id: documentId,
        limit: 3,
        score_threshold: 0.4,
      });

      const pipelineResults = response.pipeline?.merged ?? [];
      const evidence: RetrievalChunk[] = response.sources.map((source) => {
        const passage = pipelineResults.find(
          (result) => result.source === source.source && result.chunk_index === source.chunk_index
        );
        return {
          text: passage?.preview ?? "",
          source: source.source,
          chunk_index: source.chunk_index,
          score: source.score,
          chunk_length: passage?.preview.length,
        };
      });

      setLastAnswer(response);
      onResult({ question: submittedQuestion, answer: response, evidence });
      setStatus({
        mode: response.retrieved_chunks > 0 ? "success" : "no-evidence",
        detail: response.retrieved_chunks > 0
          ? "Answer generated successfully."
          : "No relevant evidence was found for that question.",
        lastQuestion: submittedQuestion,
      });
      setQuestion("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "The research workflow failed.";
      setStatus({
        mode: "error",
        detail: message,
        lastQuestion: submittedQuestion,
      });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const focusFirstEvidence = () => {
    const source = lastAnswer?.sources[0];
    if (source) onEvidenceNavigate(source.source, source.chunk_index);
  };

  if (!documentId) {
    return (
      <Card className="research-panel flex min-h-[390px] flex-col items-center justify-center px-6 py-10 text-center">
        <CardContent className="p-0">
          <div className="research-welcome-orb mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.07] text-emerald-300">
            <Sparkles className="h-7 w-7" />
          </div>
          <h2 className="text-base font-semibold text-[var(--color-text)]">Your research starts here</h2>
          <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-[var(--color-text-muted)]">
            Upload a PDF or select one from your library to ask questions and explore its evidence.
          </p>
        </CardContent>
      </Card>
    );
  }

  const answerContent = lastAnswer?.answer ?? "";
  const markdownWithEvidenceLinks = answerContent.replace(
    /\[Source:\s*([^,\]]+),\s*Chunk:\s*(\d+)\]/g,
    (_match, source: string, chunkIndex: string) =>
      `[${source.trim()} · Chunk ${chunkIndex}](#evidence-${encodeEvidenceId(source.trim(), Number(chunkIndex))})`
  );

  return (
    <Card className="research-panel flex min-w-0 flex-col overflow-hidden xl:h-[calc(100dvh-18rem)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            Ask your documents
          </h2>
          <p className="mt-1 truncate pl-9 text-[10px] text-[var(--color-text-muted)]" title={documentName}>
            {documentName ?? "Selected document"}
          </p>
        </div>
        <StatusIndicator status={documentStatus ?? "processing"} />
      </div>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-3 sm:p-4">
        <div
          ref={conversationRef}
          className="min-h-[190px] flex-1 space-y-3 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:pr-1"
        >
          {latestQuestion && (
            <div className="animate-[cardFadeIn_240ms_ease-out] ml-auto max-w-[92%] rounded-2xl rounded-br-md border border-sky-300/15 bg-sky-300/[0.07] px-3.5 py-3">
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-sky-200/70">You</div>
              <p className="whitespace-pre-wrap text-xs leading-5 text-slate-100">{latestQuestion}</p>
            </div>
          )}

          {answering && (
            <div className="research-status-card rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-3.5" role="status">
              <div className="flex items-center gap-3">
                <div className="typing-dots" aria-hidden="true"><span /><span /><span /></div>
                <div>
                  <p className="text-xs font-medium text-slate-100">Researching your document</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">Retrieving relevant passages and preparing an answer…</p>
                </div>
              </div>
            </div>
          )}

          {!answering && lastAnswer && (
            <article className="animate-[cardFadeIn_280ms_ease-out] rounded-2xl rounded-tl-md border border-emerald-300/15 bg-emerald-300/[0.035] p-3.5 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-300/10">
                    <Sparkles className="h-3 w-3" />
                  </span>
                  DocuQuery
                  <Badge variant="info">{lastAnswer.retrieved_chunks} chunks</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => void copyText(lastAnswer.answer, "answer")} aria-label="Copy answer" title="Copy answer">
                    {copied === "answer" ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={focusFirstEvidence} aria-label="Show answer evidence" title="Show answer evidence">
                    <Link2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {lastAnswer.retrieved_chunks === 0 ? (
                <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2.5 text-xs leading-5 text-amber-100/80">
                  No relevant evidence was found in this document. Try a more specific or differently phrased question.
                </div>
              ) : (
                <div className="markdown-content text-[13px]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ inline, className, children, ...props }: any) {
                        const value = String(children).replace(/\n$/, "");
                        if (inline) return <code className={className} {...props}>{value}</code>;
                        return (
                          <div className="my-3 overflow-hidden rounded-xl border border-[var(--color-border)] bg-slate-950/35">
                            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5">
                              <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Code</span>
                              <button type="button" className="text-[10px] text-emerald-300 hover:text-emerald-200" onClick={() => void copyText(value, "code")}>
                                {copied === "code" ? "Copied" : "Copy"}
                              </button>
                            </div>
                            <pre className="overflow-x-auto p-3 text-xs leading-5 text-[var(--color-text)]">
                              <code className={className} {...props}>{value}</code>
                            </pre>
                          </div>
                        );
                      },
                      a({ href, children, ...props }: any) {
                        const isEvidenceLink = href?.startsWith("#evidence-");
                        return (
                          <a
                            href={href}
                            className={isEvidenceLink ? "evidence-citation" : undefined}
                            target={isEvidenceLink ? undefined : "_blank"}
                            rel={isEvidenceLink ? undefined : "noreferrer"}
                            onClick={isEvidenceLink ? (event) => {
                              event.preventDefault();
                              const match = href.match(/^#evidence-(.*)-(\d+)$/);
                              if (match) onEvidenceNavigate(decodeURIComponent(match[1]), Number(match[2]));
                            } : undefined}
                            {...props}
                          >
                            {children}
                          </a>
                        );
                      },
                    }}
                  >
                    {markdownWithEvidenceLinks}
                  </ReactMarkdown>
                </div>
              )}
              {clipboardError && (
                <p className="mt-3 text-[10px] text-rose-300" role="alert">{clipboardError}</p>
              )}
            </article>
          )}

          {!latestQuestion && !lastAnswer && !answering && (
            <div className="flex h-full min-h-[190px] flex-col items-center justify-center px-3 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-900/60 text-slate-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <p className="text-xs font-medium text-slate-200">What would you like to discover?</p>
              <p className="mt-1 max-w-xs text-[10px] leading-4 text-slate-500">Ask a question or start with one of these prompts.</p>
            </div>
          )}
        </div>

        {!latestQuestion && !lastAnswer && (
          <div className="flex flex-wrap gap-1.5">
            {[
              "Summarize the key findings",
              "What are the main conclusions?",
              "Find evidence about a topic",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setQuestion(prompt);
                  textareaRef.current?.focus();
                }}
                className="chip-button rounded-full border border-[var(--color-border)] bg-slate-950/25 px-2.5 py-1.5 text-[10px] text-slate-400 transition-all hover:-translate-y-0.5 hover:border-emerald-300/30 hover:text-emerald-200"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={(event) => void handleSubmit(event)} className="rounded-2xl border border-[var(--color-border)] bg-slate-950/35 p-2.5 focus-within:border-emerald-300/35 focus-within:shadow-[0_0_0_3px_rgba(32,230,160,0.05)]">
          <Textarea
            ref={textareaRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your document…"
            rows={3}
            disabled={answering || documentStatus !== "ready"}
            aria-label="Your question"
            className="min-h-[70px] resize-y border-0 bg-transparent px-2 py-1.5 text-xs leading-5 shadow-none focus:ring-0"
          />
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-white/[0.05] pt-2">
            <div className="min-w-0 text-[9px] text-slate-500">
              {error ? (
                <span className="flex items-center gap-1.5 text-rose-300" role="alert">
                  <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{error}</span>
                </span>
              ) : (
                <span>Enter to send <span className="text-slate-600">·</span> Shift + Enter for a new line</span>
              )}
            </div>
            <Button
              type="submit"
              disabled={question.trim().length < 3 || answering || documentStatus !== "ready"}
              size="sm"
              className="shrink-0 rounded-xl px-3 py-2"
              aria-label={answering ? "Researching" : "Send question"}
            >
              {answering ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
              <span>{answering ? "Researching" : "Ask"}</span>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function encodeEvidenceId(source: string, chunkIndex: number) {
  return `${encodeURIComponent(source)}-${chunkIndex}`;
}
