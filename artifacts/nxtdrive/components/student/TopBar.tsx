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
      className="sticky top-0 z-30 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur-xl sm:px-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0 overflow-hidden">
            <NxtdriveLogo
              className="truncate text-base sm:text-lg"
              logoUrl={logoUrl}
              brandName={tenantName}
            />
          </div>
          <div className="hidden min-w-0 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-medium capitalize text-muted-foreground md:block">
            {today}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {notifications}
          <Avatar name={userLabel} className="h-9 w-9 text-xs shadow-lg shadow-primary/10" />
        </div>
      </div>
    </header>
  );
}
