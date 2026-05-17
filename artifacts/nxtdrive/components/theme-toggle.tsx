"use client";

import { useTransition } from "react";
import { Moon, Sun } from "lucide-react";
import { setTheme } from "@/app/actions/theme";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  current,
  className,
}: {
  current: Theme;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const next: Theme = current === "dark" ? "light" : "dark";

  function onClick() {
    // Optimistically flip the document attribute to avoid a flash.
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next);
    }
    startTransition(() => {
      void setTheme(next);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={
        current === "dark" ? "Schakel naar lichte modus" : "Schakel naar donkere modus"
      }
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
        className,
      )}
    >
      {current === "dark" ? (
        <Sun className="h-4 w-4" aria-hidden />
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
