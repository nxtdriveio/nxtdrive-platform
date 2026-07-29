import type { ReactNode } from "react";
import { BackofficeCreateMenu } from "@/components/backoffice/create-menu";
import { RouteInfoBubble } from "@/components/navigation/RouteInfoBubble";
import {
  GlobalSearch,
  MobileSearch,
} from "@/components/backoffice/global-search";
import { UserMenu } from "@/components/backoffice/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Theme } from "@/lib/theme";

export function BackofficeTopbar({
  userLabel,
  roleLabel,
  tenantName,
  theme,
  notifications,
}: {
  userLabel: string;
  roleLabel: string;
  tenantName?: string;
  theme: Theme;
  notifications?: ReactNode;
}) {
  return (
    <div className="flex h-16 min-w-0 w-full items-center gap-2 overflow-hidden pr-3 sm:gap-3 sm:px-5 lg:h-[4.5rem] lg:px-6">
      {tenantName ? (
        <span className="min-w-0 max-w-[9rem] flex-1 truncate text-sm font-black text-foreground sm:max-w-none lg:hidden">
          {tenantName}
        </span>
      ) : null}

      <GlobalSearch />

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <BackofficeCreateMenu className="hidden xl:inline-flex" />
        <MobileSearch />
        <RouteInfoBubble scope="backoffice" className="hidden md:inline-flex" />
        {notifications}
        <ThemeToggle current={theme} className="hidden md:inline-flex" />
        <UserMenu userLabel={userLabel} roleLabel={roleLabel} />
      </div>
    </div>
  );
}
