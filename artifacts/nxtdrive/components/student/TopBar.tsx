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
      className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 sm:px-5"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.7rem)" }}
    >
      <div className="mx-auto flex w-full max-w-[36rem] items-center justify-between gap-3 xl:max-w-[39rem]">
        <div className="pointer-events-auto flex min-w-0 max-w-[68vw] items-center rounded-[1.2rem] border border-border/60 bg-card/72 px-3 py-2 shadow-xl shadow-black/10 backdrop-blur-2xl">
          <NxtdriveLogo
            className="truncate text-sm font-semibold sm:text-[0.95rem]"
            logoUrl={logoUrl}
            brandName={tenantName}
          />
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {notifications}
          <Avatar
            name={userLabel}
            className="h-9 w-9 border border-border/60 bg-card/72 text-[11px] shadow-xl shadow-black/10 backdrop-blur-2xl"
          />
        </div>
      </div>
    </header>
  );
}
