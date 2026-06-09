import type { ReactNode } from "react";
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
    <div className="flex h-16 w-full items-center gap-3 px-4">
      {tenantName ? (
        <span className="truncate text-sm font-semibold text-foreground md:hidden">
          {tenantName}
        </span>
      ) : null}

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2">
        <MobileSearch />
        <RouteInfoBubble scope="backoffice" />
        {notifications}
        <ThemeToggle current={theme} />
        <UserMenu userLabel={userLabel} roleLabel={roleLabel} />
      </div>
    </div>
  );
}
