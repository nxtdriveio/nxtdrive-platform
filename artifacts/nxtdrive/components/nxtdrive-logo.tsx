import { cn } from "@/lib/utils";

/**
 * NXTDRIVE wordmark with the signature gradient "X" mark.
 * Sizes scale via the wrapper's font-size (use text-xl, text-2xl, …).
 */
export function NxtdriveLogo({
  className,
  showWordmark = true,
  logoUrl,
  brandName,
}: {
  className?: string;
  showWordmark?: boolean;
  /** When set (white-label active), render this logo instead of the wordmark. */
  logoUrl?: string | null;
  /** Accessible name / alt text for the tenant logo. */
  brandName?: string;
}) {
  const gradientId = "nxtdrive-x-gradient";

  if (logoUrl) {
    return (
      <span className={cn("inline-flex items-center", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={brandName ?? "Logo"}
          className="h-[1.6em] w-auto max-w-[180px] object-contain"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-bold tracking-tight text-foreground",
        className,
      )}
    >
      <svg
        viewBox="0 0 40 40"
        aria-hidden
        className="h-[1.15em] w-[1.15em] shrink-0"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#b8a0ff" />
            <stop offset="55%" stopColor="#7c5cff" />
            <stop offset="100%" stopColor="#4a2fd6" />
          </linearGradient>
        </defs>
        {/* Two crossing chevrons forming a notched X */}
        <path
          d="M6 6 L20 20 L6 34 L13 34 L20 27 L20 20 Z"
          fill={`url(#${gradientId})`}
        />
        <path
          d="M34 6 L20 20 L34 34 L27 34 L20 27 L20 20 Z"
          fill={`url(#${gradientId})`}
          opacity="0.85"
        />
        <path
          d="M20 13 L27 6 L34 6 L20 20 Z"
          fill={`url(#${gradientId})`}
          opacity="0.7"
        />
        <path
          d="M20 13 L13 6 L6 6 L20 20 Z"
          fill={`url(#${gradientId})`}
          opacity="0.95"
        />
      </svg>
      {showWordmark && (
        <span className="text-[1em] leading-none">
          <span className="text-foreground">NXT</span>
          <span className="text-muted-foreground">DRIVE</span>
        </span>
      )}
    </span>
  );
}
