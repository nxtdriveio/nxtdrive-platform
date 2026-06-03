import type { ReactNode } from "react";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function StudentTopBar({
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
    // `pt-[env(safe-area-inset-top)]` keeps the bar clear of the iOS status bar
    // / notch in standalone mode; env() resolves to 0 in a normal browser tab.
    <header
      className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
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
      <div className="hidden text-sm font-medium capitalize text-foreground md:block">
        {today}
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
          {userLabel}
        </span>
        {notifications}
      </div>
    </header>
  );
}
