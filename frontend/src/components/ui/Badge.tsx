import { cn } from "../../utils/cn";

export interface BadgeProps {
  variant?: "default" | "success" | "warning" | "error" | "info";
  className?: string;
  children: React.ReactNode;
}

export function Badge({ variant = "default", className, children }: BadgeProps) {
  const variants = {
    default: "bg-[var(--color-border)] text-[var(--color-text-muted)]",
    success: "bg-[var(--color-success-light)] text-[var(--color-success)] border border-[var(--color-success-border)]",
    warning: "bg-[var(--color-warning-light)] text-[var(--color-warning)] border border-[var(--color-warning-border)]",
    error: "bg-[var(--color-error-light)] text-[var(--color-error)] border border-[var(--color-error-border)]",
    info: "bg-[var(--color-accent-light)] text-[var(--color-accent)] border border-[var(--color-accent-border)]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export interface StatusIndicatorProps {
  status: "processing" | "ready" | "failed" | "idle";
  className?: string;
}

export function StatusIndicator({ status, className }: StatusIndicatorProps) {
  const configs = {
    processing: { variant: "info" as const, label: "Processing", icon: "loader" },
    ready: { variant: "success" as const, label: "Ready", icon: "check" },
    failed: { variant: "error" as const, label: "Failed", icon: "alert" },
    idle: { variant: "default" as const, label: "Idle", icon: "circle" },
  };

  const config = configs[status];

  return (
    <Badge variant={config.variant} className={cn("gap-1.5", className)}>
      {config.icon === "loader" && (
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {config.icon === "check" && (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {config.icon === "alert" && (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )}
      {config.icon === "circle" && (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" aria-hidden="true" />
      )}
      {config.label}
    </Badge>
  );
}