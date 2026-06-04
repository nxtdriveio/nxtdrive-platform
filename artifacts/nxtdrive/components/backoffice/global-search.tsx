"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, GraduationCap, UserRound, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  globalSearch,
  type SearchResultItem,
  type SearchResults,
} from "@/lib/search/actions";

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

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
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
  }, []);

  const flat = flatResults(results);
  const hasResults = flat.length > 0;

  function navigate(item: SearchResultItem) {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    router.push(item.href);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
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

  return (
    <div className="relative hidden sm:block sm:max-w-xs sm:flex-1">
      <Search
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      {loading && (
        <Loader2
          className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}
      <Input
        ref={inputRef}
        type="search"
        placeholder="Zoeken…"
        className="h-9 pl-9 pr-8 text-sm"
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

      {open && query.trim().length >= 2 && (
        <div
          ref={dropdownRef}
          role="listbox"
          aria-label="Zoekresultaten"
          className="absolute left-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
        >
          {!hasResults && !loading ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              Geen resultaten voor &ldquo;{query}&rdquo;
            </p>
          ) : (
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
                          className={`flex w-full flex-col gap-0.5 px-4 py-2 text-left transition-colors ${
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-muted/60"
                          }`}
                          onMouseEnter={() => setActiveIndex(globalIdx)}
                          onMouseLeave={() => setActiveIndex(-1)}
                          onMouseDown={(e) => {
                            e.preventDefault(); // prevent input blur before click fires
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
          )}
        </div>
      )}
    </div>
  );
}
