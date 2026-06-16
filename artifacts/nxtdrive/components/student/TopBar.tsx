import Link from "next/link";
import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Avatar } from "@/components/ui/avatar";
import { RouteInfoBubble } from "@/components/navigation/RouteInfoBubble";

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
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.35rem)" }}
    >
      <div className="mx-auto flex w-full max-w-[28.5rem] items-center justify-between gap-2.5">
        <div className="pointer-events-auto flex min-w-0 max-w-[52vw] items-center rounded-[1rem] border border-white/10 bg-card/80 px-2.5 py-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
          <NxtdriveLogo
            className="truncate text-[0.82rem] font-semibold sm:text-[0.95rem]"
            logoUrl={logoUrl}
            brandName={tenantName}
          />
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {notifications}
          <RouteInfoBubble scope="student" />
          <Link
            href="/student/berichten"
            aria-label="Berichten"
            className="relative inline-flex h-8.5 w-8.5 items-center justify-center rounded-full border border-white/10 bg-card/80 text-white/72 shadow-[0_14px_34px_rgba(0,0,0,0.24)] backdrop-blur-2xl transition hover:text-white sm:h-9 sm:w-9"
          >
            <MessageCircle className="h-4 w-4 sm:h-[1.05rem] sm:w-[1.05rem]" aria-hidden />
          </Link>
          <Avatar
            name={userLabel}
            className="h-8.5 w-8.5 border border-white/10 bg-primary/18 text-[10px] text-white shadow-[0_14px_34px_rgba(0,0,0,0.24)] backdrop-blur-2xl sm:h-9 sm:w-9 sm:text-[11px]"
          />
        </div>
      </div>
    </header>
  );
}
