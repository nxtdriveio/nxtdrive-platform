"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function DashboardShell({
  sidebar,
  topbar,
  children,
}: {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mobileOpen]);

  return (
    <div className="flex h-screen bg-[var(--surface-canvas)] text-foreground">
      {/* ── Desktop fixed sidebar ── */}
      <aside className="hidden w-[17.75rem] shrink-0 flex-col overflow-hidden border-r border-white/10 bg-brand-sidebar-background shadow-[24px_0_70px_rgba(7,20,38,0.24)] lg:flex">
        {sidebar}
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          aria-modal="true"
          role="dialog"
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            className="absolute inset-y-0 left-0 z-50 flex w-72 flex-col bg-brand-sidebar-background text-brand-sidebar-foreground shadow-2xl"
          >
            <div className="flex h-14 shrink-0 items-center justify-end border-b border-white/10 px-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Navigatie sluiten"
                className="flex h-8 w-8 items-center justify-center rounded-md text-white/68 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{sidebar}</div>
          </div>
        </div>
      )}

      {/* ── Content area ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[4.5rem] shrink-0 items-center gap-0 border-b border-brand-border/80 bg-white/78 backdrop-blur-xl">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Navigatie openen"
            aria-expanded={mobileOpen}
            className="flex h-[4.5rem] w-14 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1">{topbar}</div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-5 lg:px-6 xl:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
