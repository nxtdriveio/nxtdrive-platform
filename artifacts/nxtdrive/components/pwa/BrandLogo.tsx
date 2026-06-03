import { cn } from "@/lib/utils";

/**
 * Inline NXTDRIVE chevron-"N" monogram (Task #177). Used in splash screens,
 * offline pages and app headers so the brand mark ships as crisp SVG without an
 * extra request. `accent` tints the right chevron with the brand purple to
 * distinguish the Instructeur surfaces from the (all-white) Leerling ones.
 *
 * Branding stays NXTDRIVE-default; tenant white-label theming is applied
 * separately via BrandProvider CSS variables, not here.
 */
export function BrandLogo({
  className,
  accent = false,
}: {
  className?: string;
  accent?: boolean;
}) {
  const right = accent ? "#7c5cff" : "currentColor";
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("text-white", className)}
      role="img"
      aria-label="NXTDRIVE"
      fill="currentColor"
    >
      <path d="M6 6 L20 20 L6 34 L13 34 L20 27 L20 20 Z" />
      <path d="M34 6 L20 20 L34 34 L27 34 L20 27 L20 20 Z" fill={right} opacity="0.9" />
      <path d="M20 13 L27 6 L34 6 L20 20 Z" opacity="0.75" />
      <path d="M20 13 L13 6 L6 6 L20 20 Z" opacity="0.95" />
    </svg>
  );
}
