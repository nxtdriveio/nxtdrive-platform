import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Theme } from "@/lib/theme";

export function BackofficeTopbar({
  userLabel,
  roleLabel,
  theme,
  notifications,
}: {
  userLabel: string;
  roleLabel: string;
  theme: Theme;
  notifications?: ReactNode;
}) {
  const initials = userLabel
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <header className="flex h-16 items-center gap-4 border-b border-border bg-card/60 px-6 backdrop-blur">
      <div className="relative max-w-md flex-1">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          placeholder="Zoeken…"
          className="h-9 w-full rounded-md border border-border bg-input pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {notifications}

        <ThemeToggle current={theme} />

        <div className="ml-2 flex items-center gap-3 rounded-md border border-border bg-card px-2.5 py-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials || "?"}
          </span>
          <div className="hidden text-right sm:block">
            <div className="text-xs font-medium text-foreground leading-tight">
              {userLabel}
            </div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              {roleLabel}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
