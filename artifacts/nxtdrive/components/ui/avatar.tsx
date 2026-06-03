import { cn } from "@/lib/utils";

/** Initials from a full name, max two letters. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Initials avatar (Task #177). No image fetching — a coloured monogram in the
 * tenant primary tint. Used for instructor/student cards in both PWAs.
 */
export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary",
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
