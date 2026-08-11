import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { InstructorAgendaPeriod } from "@/lib/instructor/agenda-period";
import { cn } from "@/lib/utils";

function agendaHref(basePath: string, mode: string, date: string): string {
  const params = new URLSearchParams({ weergave: mode, datum: date });
  return `${basePath}?${params.toString()}`;
}

export function DayCalendarHeader({
  period,
  basePath,
  onQuickAdd,
}: {
  period: InstructorAgendaPeriod;
  basePath: string;
  onQuickAdd: () => void;
}) {
  return (
    <header className="relative z-30 shrink-0 border-b border-brand-border/75 bg-white/94 px-3 py-2.5 backdrop-blur-xl sm:px-4">
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={agendaHref(
              basePath,
              "day",
              period.previousDate ?? period.selectedDate,
            )}
            prefetch
            scroll={false}
            aria-label="Vorige dag"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "h-11 w-11 rounded-xl",
            )}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Link>
          <Link
            href={agendaHref(basePath, "day", period.todayYmd)}
            prefetch
            scroll={false}
            aria-label="Ga naar vandaag"
            className={cn(
              buttonVariants({
                variant:
                  period.selectedDate === period.todayYmd ? "ghost" : "outline",
                size: "sm",
              }),
              "h-11 rounded-xl px-3",
            )}
          >
            Vandaag
          </Link>
          <Link
            href={agendaHref(
              basePath,
              "day",
              period.nextDate ?? period.selectedDate,
            )}
            prefetch
            scroll={false}
            aria-label="Volgende dag"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "h-11 w-11 rounded-xl",
            )}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Link>
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-brand-primary sm:text-[11px]">
            Dagagenda
          </p>
          <h1 className="truncate text-sm font-black capitalize leading-tight text-foreground sm:text-base">
            <span className="sm:hidden">
              {period.label.replace(/^[^ ]+\s+/, "").replace(/\s+\d{4}$/, "")}
            </span>
            <span className="hidden sm:inline">
              {period.label.replace(/\s+\d{4}$/, "")}
            </span>
          </h1>
        </div>

        <button
          type="button"
          onClick={onQuickAdd}
          className={cn(
            buttonVariants(),
            "h-11 shrink-0 rounded-xl px-3 sm:px-4",
          )}
          aria-label="Nieuwe afspraak toevoegen"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Afspraak</span>
        </button>
      </div>
    </header>
  );
}
