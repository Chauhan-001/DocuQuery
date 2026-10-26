import { NavLink, useLocation } from "react-router-dom";
import {
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Menu,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";

const navigation = [
  { path: "/", label: "Research", icon: BrainCircuit, description: "Ask questions, get evidence-based answers" },
  { path: "/documents", label: "Documents", icon: FolderOpen, description: "Manage your document library" },
  { path: "/explorer", label: "RAG Explorer", icon: Sparkles, description: "Inspect the retrieval pipeline" },
  { path: "/playground", label: "Playground", icon: SlidersHorizontal, description: "Tune retrieval parameters" },
];

interface SidebarProps {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggle: () => void;
}

export function Sidebar({ open, collapsed, onClose, onToggle }: SidebarProps) {
  const location = useLocation();

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] transition-[width,transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "lg:translate-x-0 lg:shadow-none",
          collapsed ? "w-20" : "w-64",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className={cn("flex items-center border-b border-[var(--color-border)] h-16", collapsed ? "justify-center px-2" : "justify-between px-4")}>
          <NavLink to="/" className={cn("flex items-center gap-2", collapsed && "justify-center")} aria-label="DocuQuery Home" title="DocuQuery">
            <BrainCircuit className="h-7 w-7 text-[var(--color-accent)]" strokeWidth={1.9} />
            {!collapsed && <span className="text-xl font-semibold text-[var(--color-text)]">DocuQuery</span>}
          </NavLink>

          <button
            type="button"
            className={cn(
              "hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-1.5 text-[var(--color-text-muted)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--color-border)] hover:text-[var(--color-text)] lg:inline-flex",
              collapsed && "mx-auto"
            )}
            onClick={onToggle}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" strokeWidth={2.2} /> : <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />}
          </button>

          <button
            type="button"
            className="lg:hidden rounded-lg p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)]"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" strokeWidth={2.3} />
          </button>
        </div>

        <div className={cn("border-b border-[var(--color-border)] p-2 transition-all duration-300", collapsed && "px-1.5") }>
          <Button
            type="button"
            variant="primary"
            size={collapsed ? "sm" : "md"}
            className={cn("w-full gap-2 justify-center transition-all duration-200 hover:-translate-y-0.5", !collapsed && "justify-center")}
            onClick={() => {
              onClose();
              if (location.pathname !== "/") {
                window.location.href = "/";
              }
            }}
            title={collapsed ? "New research" : undefined}
          >
            <Sparkles className="h-4 w-4" strokeWidth={2.1} />
            {!collapsed && <span>New research</span>}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="Navigation">
          {navigation.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <NavLink
                key={item.path}
                to={`${item.path}${location.search}`}
                onClick={onClose}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg transition-all duration-200 ease-out",
                  collapsed ? "justify-center px-0 py-3" : "px-3 py-3",
                  isActive
                    ? "bg-[var(--color-accent-light)] text-[var(--color-accent)] shadow-[inset_0_0_0_1px_rgba(45,106,79,0.08)]"
                    : "text-[var(--color-text-muted)] hover:-translate-y-0.5 hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon className={cn("h-5 w-5 flex-shrink-0", collapsed ? "m-0" : "mt-0.5")} strokeWidth={2.1} aria-hidden="true" />
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-[var(--color-text-subtle)] group-hover:text-[var(--color-text-muted)]">
                      {item.description}
                    </span>
                  </div>
                )}
                {!collapsed && isActive && <span className="h-5 w-px bg-[var(--color-accent)] flex-shrink-0" aria-hidden="true" />}
              </NavLink>
            );
          })}
        </nav>

        <div className={cn("border-t border-[var(--color-border)] p-3", collapsed && "px-2")}>
          <div className={cn("text-xs text-[var(--color-text-subtle)] space-y-1", collapsed && "hidden")}>
            <p className="font-medium text-[var(--color-text-muted)]">Evidence-Based Research</p>
            <p>Answers grounded in your documents with source citations.</p>
          </div>
        </div>
      </aside>
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="md" onClick={onClick} className="lg:hidden" aria-label="Open navigation menu">
      <Menu className="h-5 w-5" strokeWidth={2.2} />
    </Button>
  );
}