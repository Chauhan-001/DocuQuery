import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useResearchStatus } from "../context/ResearchStatusContext";
import { cn } from "../utils/cn";

const statusStyles = {
  idle: {
    label: "Ready",
    accent: "text-[var(--color-accent)]",
    ring: "companion-idle",
    glow: "companion-glow-idle",
  },
  researching: {
    label: "Researching",
    accent: "text-cyan-300",
    ring: "companion-scan",
    glow: "companion-glow-scan",
  },
  searching: {
    label: "Searching",
    accent: "text-cyan-300",
    ring: "companion-scan",
    glow: "companion-glow-scan",
  },
  generating: {
    label: "Generating",
    accent: "text-violet-300",
    ring: "companion-pulse",
    glow: "companion-glow-pulse",
  },
  success: {
    label: "Answer ready",
    accent: "text-emerald-300",
    ring: "companion-success",
    glow: "companion-glow-success",
  },
  "no-evidence": {
    label: "No evidence",
    accent: "text-amber-300",
    ring: "companion-no-evidence",
    glow: "companion-glow-no-evidence",
  },
  error: {
    label: "Issue detected",
    accent: "text-rose-300",
    ring: "companion-error",
    glow: "companion-glow-error",
  },
} as const;

export function AICompanion() {
  const location = useLocation();
  const { status, hydeEnabled, setHydeEnabled } = useResearchStatus();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("docuquery-companion-minimized") === "true";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("docuquery-companion-minimized", String(isMinimized));
    }
  }, [isMinimized]);

  const currentStyle = statusStyles[status.mode];

  const statusText = useMemo(() => {
    if (status.lastQuestion) {
      return status.lastQuestion.length > 62 ? `${status.lastQuestion.slice(0, 62)}…` : status.lastQuestion;
    }

    return status.detail;
  }, [status.detail, status.lastQuestion]);

  if (isMinimized) {
    return (
      <button
        type="button"
        onClick={() => setIsMinimized(false)}
        className="ai-companion-minimized fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-slate-950/80 shadow-[0_0_30px_rgba(96,165,250,0.35)] backdrop-blur-xl transition-all duration-300 hover:scale-105"
        aria-label="Restore DocuQuery companion"
        title="Restore assistant"
      >
        <div className="companion-orb companion-orb-mini">
          <span className="companion-eye" />
          <span className="companion-eye" />
        </div>
      </button>
    );
  }

  return (
    <div className="ai-companion-root fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      <div
        className={cn(
          "ai-companion-panel companion-panel w-[280px] rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur-xl transition-all duration-300",
          isOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className={cn("h-2.5 w-2.5 rounded-full", currentStyle.accent.replace("text-", "bg-"))} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">DocuQuery AI</span>
          </div>
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-300 transition-colors hover:text-white"
          >
            Minimize
          </button>
        </div>

        <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
          <div className={cn("companion-orb companion-orb-panel", currentStyle.ring, currentStyle.glow)}>
            <span className="companion-eye" />
            <span className="companion-eye" />
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn("text-sm font-semibold", currentStyle.accent)}>{currentStyle.label}</div>
            <p className="truncate text-xs text-slate-300">{statusText}</p>
          </div>
        </div>

        <div className="space-y-2 text-xs text-slate-300">
          <div className="flex items-center justify-between gap-2">
            <span>Route</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-200">
              {location.pathname === "/" ? "Research" : location.pathname.replace("/", "") || "Home"}
            </span>
          </div>
          <p className="leading-relaxed text-slate-300/90">
            {status.mode === "idle" && "The workspace is ready. Select a document and ask your next question."}
            {status.mode === "researching" && "Working through your research request."}
            {status.mode === "searching" && "Scanning the selected document for the most relevant passages."}
            {status.mode === "generating" && "Synthesizing the answer from the retrieved evidence and citations."}
            {status.mode === "success" && "Answer generated successfully. Evidence and citations are ready to review."}
            {status.mode === "no-evidence" && "No clearly relevant evidence was found for that question. Try a different phrasing."}
            {status.mode === "error" && "Something interrupted the research flow. Review the error and retry."}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-100">HyDE retrieval</p>
            <p className="text-[10px] leading-4 text-slate-400">
              {hydeEnabled ? "Hypothetical query expansion on" : "Using the original query vector"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hydeEnabled}
            aria-label="Enable HyDE retrieval"
            onClick={() => setHydeEnabled(!hydeEnabled)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300",
              hydeEnabled
                ? "border-cyan-300/60 bg-cyan-400/60"
                : "border-white/20 bg-white/10"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                hydeEnabled ? "translate-x-5" : "translate-x-1"
              )}
            />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Link
            to="/"
            className="flex-1 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-2 text-center text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-400/15"
          >
            New research
          </Link>
          <Link
            to="/documents"
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-center text-xs font-medium text-slate-100 transition-colors hover:bg-white/10"
          >
            Documents
          </Link>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="group relative flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-slate-950/80 shadow-[0_0_30px_rgba(45,106,79,0.28)] backdrop-blur-xl transition-all duration-300 hover:scale-105"
        aria-label={isOpen ? "Hide companion panel" : "Open companion panel"}
        title={isOpen ? "Hide companion" : "Show companion"}
      >
        <span className={cn("companion-pulse-ring", currentStyle.glow)} />
        <div className={cn("companion-orb", currentStyle.ring, currentStyle.glow)}>
          <span className="companion-eye" />
          <span className="companion-eye" />
        </div>
      </button>
    </div>
  );
}
