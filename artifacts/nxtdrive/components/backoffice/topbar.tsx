import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Theme } from "@/lib/theme";
import { UserMenu } from "@/components/backoffice/user-menu";
import { GlobalSearch, MobileSearch } from "@/components/backoffice/global-search";

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
      {/* Tenant name — mobile only, center anchor */}
      {tenantName && (
        <span className="truncate text-sm font-semibold text-foreground md:hidden">
          {tenantName}
        </span>
      )}

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2">
        {/* Mobile search icon — visible only below sm breakpoint */}
        <MobileSearch />
        {notifications}
        <ThemeToggle current={theme} />
        <UserMenu userLabel={userLabel} roleLabel={roleLabel} />
      </div>
    </div>
  );
}
