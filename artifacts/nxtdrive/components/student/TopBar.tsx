import Link from "next/link";
import type { ReactNode } from "react";
import { MessageCircle, Search } from "lucide-react";
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
      className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 sm:px-5 xl:px-8"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.7rem)" }}
    >
      <div className="mx-auto flex w-full max-w-[430px] items-center justify-between gap-3 rounded-[1.35rem] border border-brand-border/70 bg-white/94 px-3 py-2 shadow-brand-card backdrop-blur-2xl md:max-w-5xl xl:max-w-7xl xl:px-4">
        <div className="pointer-events-auto flex min-w-0 max-w-[52vw] items-center xl:w-56 xl:max-w-none">
          <NxtdriveLogo
            className="truncate text-[0.82rem] font-semibold sm:text-[0.95rem] xl:text-lg"
            logoUrl={logoUrl}
            brandName={tenantName}
          />
        </div>

        <div className="pointer-events-auto relative hidden min-w-0 flex-1 xl:block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted-foreground"
            aria-hidden
          />
          <input
            className="h-10 w-full rounded-xl border border-brand-border bg-white/80 pl-9 pr-3 text-sm text-brand-foreground outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
            placeholder="Zoek in NXTDRIVE..."
            aria-label="Zoek in NXTDRIVE"
          />
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {notifications}
          <Link
            href="/leerling/berichten"
            aria-label="Berichten"
            className="relative inline-flex h-[2.125rem] w-[2.125rem] items-center justify-center rounded-full border border-brand-border/70 bg-white text-brand-muted-foreground shadow-sm transition hover:text-brand-primary sm:h-9 sm:w-9"
          >
            <MessageCircle className="h-4 w-4 sm:h-[1.05rem] sm:w-[1.05rem]" aria-hidden />
          </Link>
          <Avatar
            name={userLabel}
            className="h-[2.125rem] w-[2.125rem] border border-brand-border/70 bg-brand-accent text-[10px] text-brand-foreground shadow-sm sm:h-9 sm:w-9 sm:text-[11px]"
          />
          <div className="hidden min-w-0 xl:block">
            <p className="truncate text-sm font-bold text-brand-foreground">{userLabel}</p>
            <p className="truncate text-xs text-brand-muted-foreground">Leerling</p>
          </div>
        </div>
      </div>
    </header>
  );
}
