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
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.45rem)" }}
    >
      <div className="mx-auto flex w-full max-w-[28.5rem] items-center justify-between gap-2.5">
        <div className="pointer-events-auto flex min-w-0 max-w-[55vw] items-center rounded-[1.05rem] border border-white/10 bg-card/80 px-3 py-1.75 shadow-[0_14px_34px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
          <NxtdriveLogo
            className="truncate text-[0.9rem] font-semibold sm:text-[0.95rem]"
            logoUrl={logoUrl}
            brandName={tenantName}
          />
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {notifications}
          <Link
            href="/student/berichten"
            aria-label="Berichten"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-card/80 text-white/72 shadow-[0_14px_34px_rgba(0,0,0,0.24)] backdrop-blur-2xl transition hover:text-white"
          >
            <MessageCircle className="h-[1.05rem] w-[1.05rem]" aria-hidden />
          </Link>
          <Avatar
            name={userLabel}
            className="h-9 w-9 border border-white/10 bg-primary/18 text-[11px] text-white shadow-[0_14px_34px_rgba(0,0,0,0.24)] backdrop-blur-2xl"
          />
        </div>
      </div>
    </header>
  );
}
