"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
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
    <div ref={ref} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Gebruikersmenu voor ${userLabel}`}
        className="flex h-10 items-center gap-2.5 rounded-full border border-brand-border bg-white py-1 pl-1 pr-3 shadow-sm transition-colors hover:bg-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">
          {initials || "?"}
        </span>
        <div className="hidden text-left sm:block">
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
          className="absolute right-0 top-full z-50 mt-1.5 w-48 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          <Link
            href="/account/wachtwoord-wijzigen"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <User className="h-4 w-4 text-muted-foreground" aria-hidden />
            Profiel
          </Link>
          <div className="border-t border-border" />
          <form method="post" action="/auth/logout">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              aria-label="Uitloggen"
            >
              <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden />
              Uitloggen
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
