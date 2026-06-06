import type { ReactNode } from "react";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Avatar } from "@/components/ui/avatar";

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
  return (
    <header
      className="pointer-events-none fixed inset-x-0 top-0 z-40 px-4 sm:px-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
        <div className="pointer-events-auto flex min-w-0 max-w-[68vw] items-center rounded-[1.35rem] border border-border/60 bg-card/75 px-3 py-2 shadow-2xl shadow-black/10 backdrop-blur-2xl sm:max-w-xs">
          <NxtdriveLogo
            className="truncate text-sm sm:text-base"
            logoUrl={logoUrl}
            brandName={tenantName}
          />
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {notifications}
          <Avatar
            name={userLabel}
            className="h-10 w-10 border border-border/60 bg-card/75 text-[11px] shadow-2xl shadow-black/10 backdrop-blur-2xl"
          />
        </div>
      </div>
    </header>
  );
}
