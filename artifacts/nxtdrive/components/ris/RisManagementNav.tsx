import Link from "next/link";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "catalogus", href: "/backoffice/ris/catalogus", label: "Catalogus" },
  { key: "beleid", href: "/backoffice/ris/beleid", label: "Readinessbeleid" },
  {
    key: "toetsdefinities",
    href: "/backoffice/ris/toetsdefinities",
    label: "Toetsdefinities",
  },
  { key: "release", href: "/backoffice/ris/release", label: "Release" },
] as const;

export type RisManagementSection = (typeof ITEMS)[number]["key"];

export function RisManagementNav({
  active,
  versionId,
}: {
  active: RisManagementSection;
  versionId?: string | null;
}) {
  return (
    <nav
      aria-label="RIS-beheer"
      className="overflow-x-auto rounded-xl border border-border bg-card/70 p-1"
    >
      <ul className="flex min-w-max gap-1">
        {ITEMS.map((item) => {
          const href = versionId
            ? `${item.href}?version=${encodeURIComponent(versionId)}`
            : item.href;
          return (
            <li key={item.key}>
              <Link
                href={href}
                aria-current={active === item.key ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium transition-colors",
                  active === item.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
