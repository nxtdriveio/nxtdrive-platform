import Link from "next/link";
import { Bell, ClipboardList } from "lucide-react";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function InstructorTopBar({
  tenantName,
  userLabel,
}: {
  tenantName: string;
  userLabel: string;
}) {
  const today = dateFmt.format(new Date());
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:h-16 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <NxtdriveLogo className="text-base" />
        <span className="hidden text-xs uppercase tracking-wider text-muted-foreground sm:inline">
          {tenantName}
        </span>
      </div>
      <div className="hidden text-sm font-medium capitalize text-foreground md:block">
        {today}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Notificaties"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-4 w-4" aria-hidden />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        </button>
        <Link
          href="/instructor/week"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted"
        >
          <ClipboardList className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Weekplanning</span>
        </Link>
        <span className="hidden truncate text-xs text-muted-foreground lg:inline">
          {userLabel}
        </span>
      </div>
    </header>
  );
}
