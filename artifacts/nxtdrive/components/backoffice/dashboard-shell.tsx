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
      <aside className="hidden w-[16.5rem] shrink-0 flex-col overflow-hidden border-r border-white/10 bg-brand-sidebar-background shadow-[18px_0_48px_rgba(7,20,38,0.18)] lg:flex">
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
            className="absolute inset-y-0 left-0 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col bg-brand-sidebar-background text-brand-sidebar-foreground shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Navigatie sluiten"
              className="absolute right-3 top-[1.15rem] z-[60] flex h-9 w-9 items-center justify-center rounded-lg text-white/72 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <div className="min-h-0 flex-1">{sidebar}</div>
          </div>
        </div>
      )}

      {/* ── Content area ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-0 border-b border-brand-border/80 bg-white/90 backdrop-blur-xl lg:h-[4.5rem]">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Navigatie openen"
            aria-expanded={mobileOpen}
            className="flex h-16 w-12 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-14 lg:hidden"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <div className="min-w-0 flex-1">{topbar}</div>
        </header>

        <main
          data-admin-page-root=""
          className="flex-1 overflow-y-auto px-4 py-5 sm:px-5 lg:px-6 lg:py-6 xl:px-8"
        >
          <div className="mx-auto w-full max-w-[1540px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
