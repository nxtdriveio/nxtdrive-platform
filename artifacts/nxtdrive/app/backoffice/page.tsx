import Link from "next/link";
import {
  BadgeCheck,
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  Car,
  ClipboardList,
  Filter,
  Gift,
  GraduationCap,
  Inbox,
  Layers3,
  MapPin,
  Network,
  Package,
  Receipt,
  Settings,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import {
  AdminGrid,
  AdminList,
  AdminListRow,
  AdminModuleTile,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/backoffice/admin-primitives";
import {
  DashboardSection,
  type DashboardLiveData,
} from "@/components/backoffice/dashboard-section";
import { KpiSection } from "@/components/backoffice/kpi-section";
import { Badge } from "@/components/ui/badge";
import { requireActiveTenant } from "@/lib/auth/require-role";
import {
  getDashboardKpis,
  getLeadsPipeline,
  getTodayCapacity,
  getTodayLessons,
  getWeekPlanning,
} from "@/lib/dashboard/metrics";
import {
  getMonthlyRevenue,
  getOpenTasks,
  getSmartAlerts,
  getStudentProgressSummary,
  getUpcomingTrialLessons,
} from "@/lib/dashboard/reports-data";
import {
  FEATURE_LABELS,
  PLAN_LABELS,
  lockedFeatures,
} from "@/lib/platform/features";
import { loadTenantEntitlementSnapshot } from "@/lib/platform/entitlements";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const FUNNEL_STAGES = [
  { key: "new" as const, label: "Nieuw", href: "/backoffice/leads?tab=today" },
  { key: "contacted" as const, label: "Benaderd", href: "/backoffice/leads?status=contacted" },
  { key: "package_advised" as const, label: "Pakket", href: "/backoffice/leads?status=package_advised" },
  { key: "converted" as const, label: "Klant", href: "/backoffice/leads?status=converted" },
];

const CORE_MODULES = [
  {
    href: "/backoffice/leerlingen",
    label: "Leerlingen",
    description: "Dossiers, tegoed, RIS-voortgang en opvolging.",
    icon: GraduationCap,
  },
  {
    href: "/backoffice/instructeurs",
    label: "Instructeurs",
    description: "Beschikbaarheid, rayons, eigenschappen en agenda.",
    icon: Users,
  },
  {
    href: "/backoffice/planning-board",
    label: "Planning",
    description: "Resource board, open queue en planningsvalidatie.",
    icon: CalendarClock,
  },
  {
    href: "/backoffice/voertuigen",
    label: "Voertuigen",
    description: "APK, onderhoud, schade, km-standen en koppelingen.",
    icon: Car,
  },
  {
    href: "/backoffice/leads",
    label: "Leads",
    description: "Aanvragen, proeflessen, opvolging en conversie.",
    icon: Inbox,
  },
  {
    href: "/backoffice/facturen",
    label: "Facturen",
    description: "Open posten, betalingen, pakketten en Mollie-status.",
    icon: Receipt,
  },
  {
    href: "/backoffice/ris",
    label: "RIS-leskaart",
    description: "RIS-scripts, publicaties, moduletoetsen en migratie.",
    icon: BookOpenCheck,
  },
  {
    href: "/backoffice/rapportages",
    label: "Rapportages",
    description: "Omzet, lesvolume, capaciteit en aandachtssignalen.",
    icon: BarChart3,
  },
];

export default async function BackofficePage() {
  const { tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
    "branch_manager",
    "planner",
    "admin_staff",
    "marketing",
  ]);
  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();

  const [
    metrics,
    todayLessons,
    upcomingTrials,
    openTasks,
    studentProgress,
    smartAlerts,
    monthlyRevenue,
    pipeline,
    weekPlanning,
    todayCapacity,
  ] = await Promise.all([
    getDashboardKpis(supabase, tenant.id),
    getTodayLessons(supabase, tenant.id),
    getUpcomingTrialLessons(supabase, tenant.id, 4),
    getOpenTasks(supabase, tenant.id, 5),
    getStudentProgressSummary(supabase, tenant.id, 5),
    getSmartAlerts(supabase, tenant.id),
    getMonthlyRevenue(supabase, tenant.id, 6),
    getLeadsPipeline(supabase, tenant.id),
    getWeekPlanning(supabase, tenant.id),
    getTodayCapacity(supabase, tenant.id),
  ]);

  const today = new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const showSubscriptionCard = roles.includes("tenant_admin");
  const entitlementSnapshot = showSubscriptionCard
    ? await loadTenantEntitlementSnapshot(service, tenant.id)
    : null;
  const limitStatuses = entitlementSnapshot?.limitStatuses ?? null;
  const lockedCommercialFeatures =
    entitlementSnapshot?.entitlements.locked ?? lockedFeatures(tenant);
  const funnelTotal = FUNNEL_STAGES.reduce(
    (sum, stage) => sum + (pipeline[stage.key] ?? 0),
    0,
  );

  const initialLive: DashboardLiveData = {
    todayLessons,
    upcomingTrials,
    openTasks,
    smartAlerts,
    weekPlanning,
    todayCapacity,
    fetchedAt: new Date().toISOString(),
  };

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Overzicht"
        title="Dashboard"
        description={
          <>
            Operationeel overzicht van vandaag. {today.charAt(0).toUpperCase() + today.slice(1)}.
          </>
        }
        actions={
          <>
            <Link
              href="/backoffice/agenda/afspraak/nieuw"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[0_14px_30px_rgba(91,77,255,0.24)] transition-colors hover:bg-primary/90"
            >
              <CalendarDays className="h-4 w-4" aria-hidden />
              Nieuwe afspraak
            </Link>
            <Link
              href="/backoffice/leerlingen"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-brand-border bg-white px-4 text-sm font-bold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary"
            >
              <UserPlus className="h-4 w-4" aria-hidden />
              Nieuwe leerling
            </Link>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-brand-border bg-white px-4 text-sm font-bold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Filter className="h-4 w-4" aria-hidden />
              Filters
            </button>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{tenant.name}</Badge>
            <Badge variant="primary">
              {PLAN_LABELS[tenant.plan] ?? tenant.plan}
            </Badge>
          </div>
        }
      />

      <KpiSection
        tenantId={tenant.id}
        initial={{
          activeStudents: metrics.activeStudents,
          lessonsToday: metrics.lessonsToday,
          openLeads: metrics.openLeads,
          revenueThisMonthCents: metrics.revenueThisMonthCents,
          leadsToFollowUp: metrics.leadsToFollowUp,
          openInvoices: metrics.openInvoices,
          openInvoiceCents: metrics.openInvoiceCents,
          openTasks: metrics.openTasks,
          examsThisWeek: metrics.examsThisWeek,
          upcomingTrials: upcomingTrials.length,
          fetchedAt: new Date().toISOString(),
        }}
      />

      <DashboardSection
        tenantId={tenant.id}
        initial={initialLive}
        monthlyRevenue={monthlyRevenue}
        studentProgress={studentProgress}
      />

      <AdminGrid columns="2">
        <AdminPanel
          title={
            <span className="inline-flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-muted-foreground" />
              Leadfunnel
            </span>
          }
          info="Klik op een fase om direct naar de relevante leadlijst te gaan."
          actionHref="/backoffice/leads"
          actionLabel="Alle leads"
        >
          {funnelTotal === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-[var(--surface-2)] p-6 text-center text-sm text-muted-foreground">
              Nog geen leads in de funnel.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-4">
              {FUNNEL_STAGES.map((stage) => {
                const count = pipeline[stage.key] ?? 0;
                const percentage =
                  funnelTotal > 0 ? Math.round((count / funnelTotal) * 100) : 0;
                return (
                  <Link
                    key={stage.key}
                    href={stage.href}
                    className="rounded-2xl border border-border bg-[var(--surface-2)] p-4 transition-colors hover:border-primary/40 hover:bg-[var(--admin-row-hover)]"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {stage.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {count}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {percentage}% van funnel
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </AdminPanel>

        {showSubscriptionCard && limitStatuses ? (
          <AdminPanel
            title={
              <span className="inline-flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                Abonnement & limieten
              </span>
            }
            info="Commerciele limieten en locked features blijven zichtbaar voor organisatiebeheerders."
            actionHref="/backoffice/abonnement"
            actionLabel="Beheren"
          >
            <AdminList maxHeight="17rem">
              {Object.values(limitStatuses).map((status) => (
                <AdminListRow
                  key={status.key}
                  href="/backoffice/abonnement"
                  title={status.label}
                  subtitle={
                    status.isUnlimited
                      ? "Onbeperkt op huidig plan"
                      : `${status.used}/${status.limitLabel} gebruikt`
                  }
                  tone={
                    status.isOverLimit
                      ? "danger"
                      : status.isAtLimit
                        ? "warning"
                        : "success"
                  }
                  meta={
                    status.isOverLimit
                      ? "Over limiet"
                      : status.isAtLimit
                        ? "Vol"
                        : "OK"
                  }
                />
              ))}
              {lockedCommercialFeatures.slice(0, 3).map((feature) => (
                <AdminListRow
                  key={feature}
                  href="/backoffice/abonnement"
                  title={FEATURE_LABELS[feature]}
                  subtitle="Niet actief op dit abonnement"
                  tone="warning"
                  meta="Locked"
                />
              ))}
            </AdminList>
          </AdminPanel>
        ) : (
          <AdminPanel
            title="Snelle beheeracties"
            info="De belangrijkste beheerroutes blijven compact beschikbaar."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <AdminModuleTile
                href="/backoffice/cbr"
                icon={BadgeCheck}
                label="CBR-status"
                description="Machtigingen, theorie en examens."
              />
              <AdminModuleTile
                href="/backoffice/referrals"
                icon={Gift}
                label="Referrals"
                description="Ambassadeurs en beloningen."
              />
              <AdminModuleTile
                href="/backoffice/packages"
                icon={Package}
                label="Pakketten"
                description="Lespakketten en tegoed."
              />
              <AdminModuleTile
                href="/backoffice/instellingen"
                icon={Settings}
                label="Instellingen"
                description="Organisatie en voorkeuren."
              />
            </div>
          </AdminPanel>
        )}
      </AdminGrid>

      <AdminPanel
        title="Modules"
        description="Werk vanuit lijsten en detailpagina's in plaats van losse cockpitblokken."
        info="Deze tegels zijn module-ingangen; de onderliggende pagina's worden stap voor stap naar hetzelfde lijst/detailpatroon gebracht."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CORE_MODULES.map((module) => (
            <AdminModuleTile key={module.href} {...module} />
          ))}
          {roles.includes("tenant_admin") ? (
            <>
              <AdminModuleTile
                href="/backoffice/franchise"
                icon={Network}
                label="Franchise"
                description="Netwerkoverzicht, templates en prestatievergelijking."
              />
              <AdminModuleTile
                href="/backoffice/rayons"
                icon={MapPin}
                label="Rayons"
                description="Servicegebieden, reistijd en instructeurdekking."
              />
              <AdminModuleTile
                href="/backoffice/planning-queue"
                icon={ClipboardList}
                label="Planning queue"
                description="Open afspraken die nog ingepland moeten worden."
              />
              <AdminModuleTile
                href="/backoffice/packages"
                icon={Package}
                label="Pakketten"
                description="Aanbod, tegoed en commerciele inrichting."
              />
            </>
          ) : null}
        </div>
      </AdminPanel>
    </AdminPage>
  );
}
