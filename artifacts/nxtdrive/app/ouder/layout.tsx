import Link from "next/link";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { getTenantBranding, resolveLogoUrl } from "@/lib/branding";
import { BrandProvider } from "@/components/brand-provider";
import { getActiveStudent } from "@/lib/students/access";
import { loadParentPortalVisibility } from "@/lib/parent-portal/visibility";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  PortalNav,
  type PortalNavItem,
} from "@/components/parent-portal/PortalNav";

export const dynamic = "force-dynamic";

export default async function OuderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Parents only. RLS restricts every read to the parent's linked child(ren),
  // so even though a student+parent could reach here, they only ever see their
  // own child's rows. Pure parents land here from login (see role-home.ts).
  const { user, tenant, roles } = await requireActiveTenant(["parent"]);

  const { student, accessible } = await getActiveStudent(
    user,
    tenant.id,
    roles,
    { preferGuardianChildren: true },
  );
  const visibility = await loadParentPortalVisibility(
    createServiceRoleClient(),
    tenant.id,
  );

  const branding = await getTenantBranding(tenant.id);
  const logoUrl = resolveLogoUrl(tenant, branding);

  const navItems: PortalNavItem[] = [{ href: "/ouder", label: "Overzicht" }];
  if (visibility.planning)
    navItems.push({ href: "/ouder/planning", label: "Planning" });
  if (visibility.voortgang)
    navItems.push({ href: "/ouder/voortgang", label: "Voortgang" });
  if (visibility.examens)
    navItems.push({ href: "/ouder/examens", label: "Examens" });
  if (visibility.facturen)
    navItems.push({ href: "/ouder/facturen", label: "Facturen" });
  if (visibility.betalingen)
    navItems.push({ href: "/ouder/betalingen", label: "Betalingen" });
  if (visibility.pakketinformatie)
    navItems.push({
      href: "/ouder/pakketinformatie",
      label: "Pakketinformatie",
    });
  if (visibility.tegoed)
    navItems.push({ href: "/ouder/tegoed", label: "Lestegoed" });
  if (visibility.documenten)
    navItems.push({ href: "/ouder/documenten", label: "Documenten" });

  const multipleChildren = accessible.length > 1;

  return (
    <BrandProvider
      tenant={tenant}
      branding={branding}
      className="min-h-screen bg-background text-foreground"
    >
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={tenant.name} className="h-8 w-auto" />
            ) : (
              <span className="text-base font-semibold">{tenant.name}</span>
            )}
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Ouderportaal
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {student ? (
              <span className="text-muted-foreground">
                Leerling:{" "}
                <span className="font-medium text-foreground">
                  {student.full_name}
                </span>
              </span>
            ) : null}
            {multipleChildren ? (
              <Link
                href="/ouder/select-child"
                className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                Wisselen
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <aside className="lg:w-56 lg:shrink-0">
          <div className="lg:sticky lg:top-6">
            <PortalNav items={navItems} />
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </BrandProvider>
  );
}
