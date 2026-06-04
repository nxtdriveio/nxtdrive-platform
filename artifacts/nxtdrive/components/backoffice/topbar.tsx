import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Theme } from "@/lib/theme";
import { UserMenu } from "@/components/backoffice/user-menu";
import { Input } from "@/components/ui/input";

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

      {/* Search — hidden on small mobile, visible from sm+ */}
      <div className="relative hidden sm:block sm:max-w-xs sm:flex-1">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Zoeken…"
          className="h-9 pl-9 text-sm"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {notifications}
        <ThemeToggle current={theme} />
        <UserMenu userLabel={userLabel} roleLabel={roleLabel} />
      </div>
    </div>
  );
}
