import { BrainCircuit, Menu, Server, CircleAlert, LoaderCircle } from "lucide-react";

interface ServiceStatus {
  node: "healthy" | "unhealthy" | "checking";
  python: "healthy" | "unhealthy" | "checking";
}

export function Header({ status, onMenuClick }: { status: ServiceStatus; onMenuClick: () => void }) {
  return (
    <header className="workspace-header sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-4 backdrop-blur-xl lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 text-[var(--color-text-muted)] transition-colors hover:bg-white/[0.05] hover:text-[var(--color-text)] lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" strokeWidth={1.8} />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-300">
            <BrainCircuit className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight text-slate-100 sm:block">DocuQuery</span>
        </div>
        <span className="hidden h-4 w-px bg-white/10 sm:block" />
        <span className="hidden truncate text-xs text-slate-400 md:block">
          Evidence-based research workspace
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5">
        <ServicePill label="Node API" value={status.node} />
        <ServicePill label="Python AI" value={status.python} />
      </div>
    </header>
  );
}

function ServicePill({ label, value }: { label: string; value: ServiceStatus["node"] }) {
  const healthy = value === "healthy";
  const checking = value === "checking";
  const StateIcon = checking ? LoaderCircle : healthy ? Server : CircleAlert;
  const color = checking
    ? "text-slate-400"
    : healthy
      ? "text-emerald-300"
      : "text-rose-300";

  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-slate-950/30 px-2 py-1 text-[10px] sm:gap-2 sm:px-2.5"
      title={`${label}: ${value}`}
      aria-label={`${label} ${value}`}
    >
      <StateIcon className={`h-3 w-3 ${color} ${checking ? "animate-spin" : ""}`} aria-hidden="true" />
      <span className="hidden text-slate-400 sm:inline">{label}</span>
      <span className={`hidden font-medium sm:inline ${color}`}>
        {checking ? "Checking" : healthy ? "Online" : "Offline"}
      </span>
      <span className={`h-1.5 w-1.5 rounded-full sm:hidden ${checking ? "bg-slate-400" : healthy ? "bg-emerald-300" : "bg-rose-300"}`} />
    </div>
  );
}