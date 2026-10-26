import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar, MobileMenuButton } from "./Sidebar";
import { Header } from "./Header";
import { AICompanion } from "../AICompanion";
import { useSystemStatus } from "../../hooks/useDocuments";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem("docuquery-sidebar-collapsed");
    return stored === "true";
  });
  const { status } = useSystemStatus();

  useEffect(() => {
    window.localStorage.setItem("docuquery-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div className="app-shell flex h-dvh min-h-0 bg-[var(--color-bg)] text-[var(--color-text)]">
      <Sidebar
        open={sidebarOpen}
        collapsed={sidebarCollapsed}
        onClose={() => setSidebarOpen(false)}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header status={status} onMenuClick={() => setSidebarOpen(true)} />
        <main className="relative z-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pt-3 pb-24 sm:px-4 sm:pt-4 lg:px-5 lg:pt-5">
          <Outlet />
        </main>
      </div>
      <AICompanion />
    </div>
  );
}