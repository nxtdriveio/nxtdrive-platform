"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function InfoBubble({
  label = "Meer info",
  children,
  className,
  contentClassName,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <div
        className="inline-flex"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              className,
            )}
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className={cn("w-72 rounded-2xl p-3 text-sm leading-6", contentClassName)}
        >
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Info
            </p>
            <div className="text-foreground">{children}</div>
          </div>
        </DropdownMenuContent>
      </div>
    </DropdownMenu>
  );
}
