"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type PortalNavItem = { href: string; label: string };

export function PortalNav({ items }: { items: PortalNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const active =
          item.href === "/ouder"
            ? pathname === "/ouder"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-md px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
