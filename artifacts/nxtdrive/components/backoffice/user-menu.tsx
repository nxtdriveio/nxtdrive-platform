"use client";

import { useState, useRef, useEffect } from "react";
import { LogOut, User, ChevronDown } from "lucide-react";

export function UserMenu({
  userLabel,
  roleLabel,
}: {
  userLabel: string;
  roleLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const initials = userLabel
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative ml-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Gebruikersmenu voor ${userLabel}`}
        className="flex items-center gap-3 rounded-md border border-border bg-card px-2.5 py-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials || "?"}
        </span>
        <div className="hidden text-right sm:block">
          <div className="text-xs font-medium leading-tight text-foreground">
            {userLabel}
          </div>
          <div className="text-[11px] leading-tight text-muted-foreground">
            {roleLabel}
          </div>
        </div>
        <ChevronDown
          className={`hidden h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform sm:block ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-md border border-border bg-card shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            disabled
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground opacity-50 cursor-not-allowed"
            aria-disabled="true"
          >
            <User className="h-4 w-4" aria-hidden />
            Profiel
          </button>
          <div className="border-t border-border" />
          <form method="post" action="/auth/logout">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              aria-label="Uitloggen"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Uitloggen
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
