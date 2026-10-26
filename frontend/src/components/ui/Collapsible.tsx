import { useState, forwardRef, type HTMLAttributes, useId } from "react";
import { cn } from "../../utils/cn";
import { ChevronDownIcon } from "../icons";

export interface CollapsibleProps {
  defaultOpen?: boolean;
  trigger: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Collapsible({ defaultOpen = false, trigger, children, className }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const triggerId = useId();
  const contentId = useId();

  return (
    <div className={cn("border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-elevated)] overflow-hidden", className)}>
      <button
        id={triggerId}
        aria-expanded={open}
        aria-controls={contentId}
        className="w-full px-4 py-3 flex items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-inset"
        onClick={() => setOpen(!open)}
      >
        <span className="font-medium text-[var(--color-text)]">{trigger}</span>
        <ChevronDownIcon className={cn("h-5 w-5 text-[var(--color-text-muted)] transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      <div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        className={cn("px-4 pb-4 border-t border-[var(--color-border)]", !open && "hidden")}
      >
        {children}
      </div>
    </div>
  );
}

export interface CollapsiblePanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const CollapsiblePanel = forwardRef<HTMLDivElement, CollapsiblePanelProps>(
  ({ title, children, defaultOpen = false, open: controlledOpen, onOpenChange, className, ...props }, ref) => {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const open = controlledOpen ?? internalOpen;
    const toggleOpen = () => {
      const nextOpen = !open;
      setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    };
    const triggerId = useId();
    const contentId = useId();

    return (
      <div ref={ref} className={cn("border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-elevated)] overflow-hidden", className)} {...props}>
        <button
          id={triggerId}
          aria-expanded={open}
          aria-controls={contentId}
          className="w-full px-4 py-3 flex items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-inset hover:bg-[var(--color-border)]/50"
          onClick={toggleOpen}
        >
          <span className="font-medium text-[var(--color-text)]">{title}</span>
          <ChevronDownIcon className={cn("h-5 w-5 text-[var(--color-text-muted)] transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
        <div
          id={contentId}
          role="region"
          aria-labelledby={triggerId}
          className={cn("px-4 pb-4 border-t border-[var(--color-border)]", !open && "hidden")}
        >
          {children}
        </div>
      </div>
    );
  }
);

CollapsiblePanel.displayName = "CollapsiblePanel";