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
      <aside className="hidden md:flex md:w-72 md:shrink-0 md:flex-col md:border-r md:border-border md:bg-[var(--admin-sidebar)]">
        {sidebar}
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
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
            className="absolute inset-y-0 left-0 z-50 flex w-72 flex-col bg-[var(--admin-sidebar)] shadow-2xl"
          >
            <div className="flex h-14 shrink-0 items-center justify-end border-b border-border px-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Navigatie sluiten"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <header className="flex h-16 shrink-0 items-center gap-0 border-b border-border bg-[var(--admin-header)] backdrop-blur">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Navigatie openen"
            aria-expanded={mobileOpen}
            className="flex h-16 w-14 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
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

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
