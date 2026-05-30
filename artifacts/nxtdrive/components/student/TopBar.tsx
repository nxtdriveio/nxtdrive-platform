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
}: {
  tenantName: string;
  userLabel: string;
  logoUrl?: string | null;
}) {
  const today = dateFmt.format(new Date());
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
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
      <div className="truncate text-xs text-muted-foreground">
        {userLabel}
      </div>
    </header>
  );
}
