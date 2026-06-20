"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, GraduationCap, Loader2, Search, UserRound } from "lucide-react";
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

function flatten(results: SearchResults): SearchResultItem[] {
  return [...results.students, ...results.leads, ...results.lessons];
}

export function InstructorQuickSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (query.trim().length < 2) {
      setResults(EMPTY);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    timeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const next = await globalSearch(query);
        setResults(next);
        setOpen(true);
        setActiveIndex(-1);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !inputRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const flat = flatten(results);

  function navigate(item: SearchResultItem) {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    setActiveIndex(-1);
    router.push(item.href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!open || flat.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + flat.length) % flat.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flat[activeIndex];
      if (item) navigate(item);
    }
  }

  let sectionOffset = 0;

  return (
    <div className="relative hidden w-full xl:block">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      {loading ? (
        <Loader2
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      ) : null}
      <Input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (flat.length > 0) setOpen(true);
        }}
        placeholder="Zoek in leerlingen, leads en lessen…"
        className="h-10 rounded-xl border-border/80 bg-background pl-9 pr-9 shadow-sm"
        autoComplete="off"
        role="combobox"
        aria-label="Snel zoeken in leerlingen, leads en lessen"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-autocomplete="list"
      />

      {open && query.trim().length >= 2 ? (
        <div
          ref={panelRef}
          role="listbox"
          aria-label="Zoekresultaten"
          className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-popover shadow-brand-card"
        >
          {flat.length === 0 && !loading ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Geen resultaten voor &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <div className="max-h-[24rem] overflow-y-auto py-1">
              {SECTIONS.map((section) => {
                const items = results[section];
                if (items.length === 0) return null;
                const { label, Icon } = SECTION_META[section];
                const start = sectionOffset;
                sectionOffset += items.length;
                return (
                  <div key={section}>
                    <div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase text-muted-foreground">
                      <Icon className="h-3 w-3" aria-hidden />
                      {label}
                    </div>
                    {items.map((item, index) => {
                      const globalIndex = start + index;
                      const isActive = activeIndex === globalIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`
                            flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors
                            ${isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"}
                          `}
                          onMouseEnter={() => setActiveIndex(globalIndex)}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            navigate(item);
                          }}
                        >
                          <span className="truncate text-sm font-medium text-foreground">
                            {item.title}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
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
      ) : null}
    </div>
  );
}
