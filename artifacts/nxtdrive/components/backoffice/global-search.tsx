"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  GraduationCap,
  UserRound,
  CalendarDays,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  globalSearch,
  type SearchResultItem,
  type SearchResults,
} from "@/lib/search/actions";

// ── Constants ──────────────────────────────────────────────────────────────────

const EMPTY: SearchResults = { students: [], leads: [], lessons: [] };

const SECTION_META = {
  students: { label: "Leerlingen", Icon: GraduationCap },
  leads: { label: "Leads", Icon: UserRound },
  lessons: { label: "Lessen", Icon: CalendarDays },
} as const;

const SECTIONS = ["students", "leads", "lessons"] as const;
type Section = (typeof SECTIONS)[number];

function flatResults(r: SearchResults): SearchResultItem[] {
  return [...r.students, ...r.leads, ...r.lessons];
}

function sectionOffset(r: SearchResults, key: Section): number {
  if (key === "students") return 0;
  if (key === "leads") return r.students.length;
  return r.students.length + r.leads.length;
}

// ── Shared hook ────────────────────────────────────────────────────────────────

function useSearch(onNavigate?: () => void) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await globalSearch(q);
      setResults(res);
      setOpen(true);
      setActiveIndex(-1);
    } catch {
      setResults(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults(EMPTY);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => void runSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const flat = flatResults(results);
  const hasResults = flat.length > 0;

  function navigate(item: SearchResultItem) {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    onNavigate?.();
    router.push(item.href);
  }

  function reset() {
    setQuery("");
    setResults(EMPTY);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!open || flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[activeIndex];
      if (item) navigate(item);
    }
  }

  return {
    query,
    setQuery,
    results,
    loading,
    open,
    setOpen,
    activeIndex,
    setActiveIndex,
    flat,
    hasResults,
    navigate,
    handleKeyDown,
    reset,
  };
}

// ── Shared result list ─────────────────────────────────────────────────────────

function ResultList({
  results,
  loading,
  query,
  flat,
  hasResults,
  activeIndex,
  setActiveIndex,
  navigate,
}: {
  results: SearchResults;
  loading: boolean;
  query: string;
  flat: SearchResultItem[];
  hasResults: boolean;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  navigate: (item: SearchResultItem) => void;
}) {
  if (!hasResults && !loading) {
    return (
      <p className="px-4 py-3 text-xs text-muted-foreground">
        Geen resultaten voor &ldquo;{query}&rdquo;
      </p>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto py-1">
      {SECTIONS.map((key) => {
        const items = results[key];
        if (items.length === 0) return null;
        const { label, Icon } = SECTION_META[key];
        const base = sectionOffset(results, key);
        return (
          <div key={key}>
            <div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Icon className="h-3 w-3" aria-hidden />
              {label}
            </div>
            {items.map((item, idx) => {
              const globalIdx = base + idx;
              const isActive = globalIdx === activeIndex;
              return (
                <button
                  key={item.id}
                  role="option"
                  aria-selected={isActive}
                  tabIndex={-1}
                  className={`flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/60"
                  }`}
                  onMouseEnter={() => setActiveIndex(globalIdx)}
                  onMouseLeave={() => setActiveIndex(-1)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    navigate(item);
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    navigate(item);
                  }}
                >
                  <span className="truncate text-sm font-medium leading-tight text-foreground">
                    {item.title}
                  </span>
                  <span className="truncate text-xs leading-tight text-muted-foreground">
                    {item.subtitle}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Desktop search (sm+) ───────────────────────────────────────────────────────

export function GlobalSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    query,
    setQuery,
    results,
    loading,
    open,
    setOpen,
    activeIndex,
    setActiveIndex,
    flat,
    hasResults,
    navigate,
    handleKeyDown,
  } = useSearch();

  // Close when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [setOpen]);

  return (
    <div className="relative hidden sm:block sm:max-w-[38rem] sm:flex-1">
      <Search
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      {loading && (
        <Loader2
          className="absolute right-14 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}
      <Input
        ref={inputRef}
        type="search"
        placeholder="Zoek leerling, afspraak, voertuig, bericht..."
        className="h-9 rounded-xl border-brand-border bg-white/92 pl-9 pr-16 text-sm shadow-sm placeholder:text-muted-foreground/78 focus-visible:ring-brand-ring/30"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (hasResults) setOpen(true);
        }}
        autoComplete="off"
        role="combobox"
        aria-label="Zoeken in leerlingen, leads en lessen"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-autocomplete="list"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-brand-border bg-brand-muted px-1.5 py-0.5 text-[10px] font-black text-muted-foreground lg:block">
        Ctrl K
      </span>

      {open && query.trim().length >= 2 && (
        <div
          ref={dropdownRef}
          role="listbox"
          aria-label="Zoekresultaten"
          className="absolute left-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
        >
          <ResultList
            results={results}
            loading={loading}
            query={query}
            flat={flat}
            hasResults={hasResults}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            navigate={navigate}
          />
        </div>
      )}
    </div>
  );
}

// ── Mobile search (< sm) — icon button + full-screen overlay ──────────────────

export function MobileSearch() {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    query,
    setQuery,
    results,
    loading,
    open,
    activeIndex,
    setActiveIndex,
    flat,
    hasResults,
    navigate,
    handleKeyDown,
    reset,
  } = useSearch(() => setOverlayOpen(false));

  function openOverlay() {
    setOverlayOpen(true);
  }

  function closeOverlay() {
    reset();
    setOverlayOpen(false);
  }

  // Auto-focus input when overlay opens
  useEffect(() => {
    if (!overlayOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [overlayOpen]);

  // Close on Escape at document level
  useEffect(() => {
    if (!overlayOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOverlay();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [overlayOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Icon trigger — visible only on mobile */}
      <button
        type="button"
        onClick={openOverlay}
        aria-label="Zoeken openen"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
      >
        <Search className="h-4.5 w-4.5" aria-hidden />
      </button>

      {/* Full-screen overlay */}
      {overlayOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Zoeken"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={closeOverlay}
            aria-hidden
          />

          {/* Panel */}
          <div className="relative z-10 border-b border-border bg-background shadow-lg">
            {/* Input row */}
            <div className="flex items-center gap-2 px-3 py-3">
              <Search
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <input
                ref={inputRef}
                type="search"
                placeholder="Zoeken in leerlingen, leads en lessen..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  handleKeyDown(e);
                  if (e.key === "Escape") closeOverlay();
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                role="combobox"
                aria-label="Zoeken"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-autocomplete="list"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {loading && (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                  aria-hidden
                />
              )}
              <button
                type="button"
                onClick={closeOverlay}
                aria-label="Zoeken sluiten"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Results */}
            {open && query.trim().length >= 2 && (
              <div
                role="listbox"
                aria-label="Zoekresultaten"
                className="border-t border-border"
              >
                <ResultList
                  results={results}
                  loading={loading}
                  query={query}
                  flat={flat}
                  hasResults={hasResults}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                  navigate={navigate}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
