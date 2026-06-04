import type { ReactNode } from "react";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Avatar } from "@/components/ui/avatar";

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
      </div>

      <div className="hidden text-sm font-medium capitalize text-foreground sm:block">
        {today}
      </div>

      <div className="flex items-center gap-2">
        {notifications}
        <Avatar name={userLabel} className="h-8 w-8 text-xs" />
      </div>
    </header>
  );
}
