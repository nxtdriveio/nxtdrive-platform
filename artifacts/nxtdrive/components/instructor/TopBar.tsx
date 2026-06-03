import type { ReactNode } from "react";
import Link from "next/link";
import { ClipboardList, CalendarClock, ListTodo, Zap, Bell } from "lucide-react";
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
  logoUrl,
  notifications,
}: {
  tenantName: string;
  userLabel: string;
  logoUrl?: string | null;
  notifications?: ReactNode;
}) {
  const today = dateFmt.format(new Date());
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:h-16 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <NxtdriveLogo
          className="text-base"
          logoUrl={logoUrl}
          brandName={tenantName}
        />
        <span className="hidden text-xs uppercase tracking-wider text-muted-foreground sm:inline">
          {tenantName}
        </span>
      </div>
      <div className="hidden text-sm font-medium capitalize text-foreground lg:block">
        {today}
      </div>
      <div className="flex items-center gap-2">
        {notifications}
        <Link
          href="/instructor/meldingen"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted"
        >
          <Bell className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Meldingen</span>
        </Link>
        <Link
          href="/backoffice/taken"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted"
        >
          <ListTodo className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Taken</span>
        </Link>
        <Link
          href="/instructor/beschikbaarheid"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted"
        >
          <CalendarClock className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Beschikbaarheid</span>
        </Link>
        <Link
          href="/instructor/week"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted"
        >
          <ClipboardList className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Weekplanning</span>
        </Link>
        <Link
          href="#acties"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Zap className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Acties</span>
        </Link>
        <span className="hidden truncate text-xs text-muted-foreground xl:inline">
          {userLabel}
        </span>
      </div>
    </header>
  );
}
