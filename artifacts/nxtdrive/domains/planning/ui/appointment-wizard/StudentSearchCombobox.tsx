"use client";

import { Loader2, Search, UserRound, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type {
  InstructorStudentSearchResult,
  WizardActionResult,
} from "../../application/smart-appointment-contracts";

export function StudentSearchCombobox({
  value,
  onChange,
  searchAction,
}: {
  value: InstructorStudentSearchResult | null;
  onChange: (student: InstructorStudentSearchResult | null) => void;
  searchAction: (
    query: string,
  ) => Promise<WizardActionResult<readonly InstructorStudentSearchResult[]>>;
}) {
  const id = useId();
  const request = useRef(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    readonly InstructorStudentSearchResult[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Typ minimaal 3 tekens");
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const trimmed = query.trim();
    if (value || trimmed.length < 3) {
      setResults([]);
      setBusy(false);
      setActiveIndex(-1);
      setMessage(value ? "Leerling geselecteerd" : "Typ minimaal 3 tekens");
      return;
    }
    const requestId = ++request.current;
    const timer = window.setTimeout(async () => {
      window.dispatchEvent(
        new CustomEvent("nxtdrive:analytics", {
          detail: { name: "student_search_started" },
        }),
      );
      void fetch("/api/instructeur/appointment-wizard/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ event: "student_search_started" }),
      }).catch(() => undefined);
      setBusy(true);
      setMessage("Zoeken...");
      const result = await searchAction(trimmed);
      if (requestId !== request.current) return;
      setBusy(false);
      if (!result.ok) {
        setResults([]);
        setMessage(
          "Leerlingen konden niet worden geladen. Probeer het opnieuw.",
        );
        return;
      }
      setResults(result.data);
      setActiveIndex(result.data.length ? 0 : -1);
      setMessage(
        result.data.length
          ? `${result.data.length} ${result.data.length === 1 ? "leerling" : "leerlingen"} gevonden`
          : "Geen actieve leerling gevonden",
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, searchAction, value]);

  function select(student: InstructorStudentSearchResult) {
    setResults([]);
    setQuery(student.displayName);
    setMessage(`${student.displayName} geselecteerd`);
    onChange(student);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? results.length - 1 : current - 1,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      select(results[activeIndex]!);
    } else if (event.key === "Escape") {
      setResults([]);
      setActiveIndex(-1);
    }
  }

  if (value) {
    return (
      <div
        className="flex min-h-14 items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50/70 px-4 py-3 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
        data-selected-student=""
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-900">
          <UserRound className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-black">{value.displayName}</span>
          <span className="block text-xs opacity-75">
            Actief · {value.contextualLabel}
          </span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          aria-label="Andere leerling kiezen"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative space-y-1.5">
      <Label htmlFor={`${id}-input`}>Leerling</Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={`${id}-input`}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={onKeyDown}
          placeholder="Zoek op naam..."
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          aria-expanded={results.length > 0}
          aria-activedescendant={
            activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
          }
          aria-busy={busy}
          className="h-11 pl-9 pr-10"
        />
        {busy ? (
          <Loader2
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden
          />
        ) : null}
      </div>
      <p
        className="text-xs text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
      {results.length > 0 ? (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border bg-popover p-1 shadow-xl"
        >
          {results.map((student, index) => (
            <li
              key={student.id}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(student)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-muted"
              >
                <UserRound
                  className="h-4 w-4 shrink-0 text-primary"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">
                    {student.displayName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Actief · {student.contextualLabel}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
