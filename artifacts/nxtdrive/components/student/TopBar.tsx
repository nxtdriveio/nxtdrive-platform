import Link from "next/link";
import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";
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
      className="pointer-events-none fixed inset-x-0 top-0 z-40 px-4 sm:px-5"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.85rem)" }}
    >
      <div className="mx-auto flex w-full max-w-[29rem] items-center justify-between gap-2.5">
        <div className="pointer-events-auto flex min-w-0 max-w-[58vw] items-center rounded-[1.25rem] border border-white/10 bg-card/78 px-3.5 py-2.5 shadow-[0_18px_40px_rgba(0,0,0,0.26)] backdrop-blur-2xl">
          <NxtdriveLogo
            className="truncate text-sm font-semibold sm:text-[0.95rem]"
            logoUrl={logoUrl}
            brandName={tenantName}
          />
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {notifications}
          <Link
            href="/student/berichten"
            aria-label="Berichten"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-card/78 text-white/72 shadow-[0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur-2xl transition hover:text-white"
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
          </Link>
          <Avatar
            name={userLabel}
            className="h-10 w-10 border border-white/10 bg-primary/18 text-[11px] text-white shadow-[0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur-2xl"
          />
        </div>
      </div>
    </header>
  );
}
