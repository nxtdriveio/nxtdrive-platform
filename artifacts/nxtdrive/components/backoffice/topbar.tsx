import type { ReactNode } from "react";
import { BackofficeCreateMenu } from "@/components/backoffice/create-menu";
import { RouteInfoBubble } from "@/components/navigation/RouteInfoBubble";
import { GlobalSearch, MobileSearch } from "@/components/backoffice/global-search";
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
    <div className="flex h-[4.5rem] w-full items-center gap-3 px-4 sm:px-5 lg:px-6">
      {tenantName ? (
        <span className="truncate text-sm font-black text-foreground lg:hidden">
          {tenantName}
        </span>
      ) : null}

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2">
        <BackofficeCreateMenu className="hidden xl:inline-flex" />
        <MobileSearch />
        <RouteInfoBubble scope="backoffice" />
        {notifications}
        <ThemeToggle current={theme} />
        <UserMenu userLabel={userLabel} roleLabel={roleLabel} />
      </div>
    </div>
  );
}
