"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type LessonScoreSliderProps = {
  value: number;
  min: number;
  max: number;
  marks: string[];
  ariaLabel: string;
  formatValue: (value: number) => string;
  onCommit: (value: number) => void;
  unset?: boolean;
  unsetLabel?: string;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
};

/**
 * Shared touch-first score input for legacy and RIS lesson cards.
 *
 * The visual value updates while dragging, but persistence only starts when the
 * thumb is released or keyboard interaction finishes. This prevents a server
 * write for every intermediate slider position.
 */
export function LessonScoreSlider({
  value,
  min,
  max,
  marks,
  ariaLabel,
  formatValue,
  onCommit,
  unset = false,
  unsetLabel = "Nog niet beoordeeld",
  disabled = false,
  pending = false,
  className,
}: LessonScoreSliderProps) {
  const [draft, setDraft] = useState(value);
  const [hasInteracted, setHasInteracted] = useState(!unset);
  const lastSubmitted = useRef<number | null>(unset ? null : value);
  const dirty = useRef(false);

  useEffect(() => {
    setDraft(value);
    setHasInteracted(!unset);
    lastSubmitted.current = unset ? null : value;
    dirty.current = false;
  }, [unset, value]);

  function updateDraft(nextValue: number) {
    dirty.current = true;
    setHasInteracted(true);
    setDraft(nextValue);
  }

  function commit(nextValue: number, confirmUnset = false) {
    if (disabled || (!dirty.current && !(unset && confirmUnset))) return;
    dirty.current = false;
    setHasInteracted(true);
    if (nextValue === lastSubmitted.current) return;
    lastSubmitted.current = nextValue;
    onCommit(nextValue);
  }

  const displayValue =
    unset && !hasInteracted ? unsetLabel : formatValue(draft);

  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-border bg-background/70 px-3 py-2.5",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">
          Niveau
        </span>
        <output
          className="inline-flex min-h-7 min-w-16 items-center justify-center rounded-lg bg-primary-soft px-2.5 text-xs font-black tabular-nums text-primary"
          aria-live="polite"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Opslaan…" />
          ) : (
            displayValue
          )}
        </output>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={draft}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-valuetext={displayValue}
        onChange={(event) => updateDraft(Number(event.currentTarget.value))}
        onPointerUp={(event) => commit(Number(event.currentTarget.value), true)}
        onKeyUp={(event) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(event.key)
          ) {
            commit(Number(event.currentTarget.value), true);
          }
        }}
        onBlur={(event) => commit(Number(event.currentTarget.value))}
        className="h-7 w-full cursor-pointer touch-pan-y accent-primary disabled:cursor-not-allowed"
      />
      <div
        className="mt-0.5 grid text-center text-[0.62rem] font-semibold tabular-nums text-muted-foreground"
        style={{
          gridTemplateColumns: `repeat(${marks.length}, minmax(0, 1fr))`,
        }}
        aria-hidden
      >
        {marks.map((mark, index) => (
          <span key={`${mark}-${index}`}>{mark}</span>
        ))}
      </div>
    </div>
  );
}
