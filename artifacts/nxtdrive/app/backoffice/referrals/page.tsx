import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Gift,
  Trophy,
  Users,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadReferralOverview } from "@/lib/referrals/data";
import {
  LEAD_STATUS_LABEL,
  LEAD_STATUS_VARIANT,
  type LeadStatus,
} from "@/lib/leads/types";
import { RewardToggle } from "./reward-toggle";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card className="border-border/80 bg-card/70">
      <CardContent className="flex items-start justify-between gap-3 pt-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}

export default async function ReferralsPage() {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const service = createServiceRoleClient();
  const groups = await loadReferralOverview(service, tenant.id);

  const totalReferred = groups.reduce(
    (sum, g) => sum + g.referredLeads.length,
    0,
  );
  const totalPending = groups.reduce(
    (sum, g) => sum + g.pendingRewardCount,
    0,
  );
  const totalConverted = groups.reduce((sum, g) => sum + g.convertedCount, 0);
  const totalRewarded = groups.reduce(
    (sum, g) =>
      sum +
      g.referredLeads.filter((lead) => lead.rewardHandledAt !== null).length,
    0,
  );
  const conversionRate =
    totalReferred > 0 ? Math.round((totalConverted / totalReferred) * 100) : 0;
  const topReferrers = groups.slice(0, 4);
  const statusCounts = groups
    .flatMap((group) => group.referredLeads)
    .reduce<Record<string, number>>((acc, lead) => {
      acc[lead.status] = (acc[lead.status] ?? 0) + 1;
      return acc;
    }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/90">
            <Gift className="h-3.5 w-3.5" aria-hidden />
            Groei via leerlingen
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Referrals
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Houd referrals, conversie en beloningsafhandeling van {tenant.name}{" "}
              bij in een compacte groeicockpit.
            </p>
          </div>
        </div>
        <Link
          href="/backoffice/leads"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Naar leads
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Doorverwijzers"
          value={String(groups.length)}
          hint="Leerlingen die minimaal een lead hebben aangedragen."
          icon={Users}
        />
        <StatCard
          label="Referral-leads"
          value={String(totalReferred)}
          hint="Totaal aantal aanmeldingen via leerlinguitnodigingen."
          icon={Gift}
        />
        <StatCard
          label="Conversie"
          value={`${conversionRate}%`}
          hint={`${totalConverted} referral-leads zijn gestart of geconverteerd.`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Beloningen open"
          value={String(totalPending)}
          hint={`${totalRewarded} referrals zijn al administratief afgewerkt.`}
          icon={Clock3}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Programmasignalen</CardTitle>
            <p className="text-sm text-muted-foreground">
              Waar referral-groei al werkt en waar handmatige opvolging blijft
              hangen.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Beste ambassadeur
              </p>
              <p className="mt-1 font-medium text-foreground">
                {topReferrers[0]?.studentName ?? "Nog geen ambassadeur actief"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {topReferrers[0]
                  ? `${topReferrers[0].referredLeads.length} referrals, ${topReferrers[0].convertedCount} geconverteerd.`
                  : "Zodra leerlingen iemand aandragen verschijnt hier de koploper."}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Reward-achterstand
              </p>
              <p className="mt-1 font-medium text-foreground">
                {totalPending === 0
                  ? "Geen achterstand"
                  : `${totalPending} open beloningen`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Geconverteerde referrals blijven zichtbaar tot een beheerder de
                beloning expliciet afhandelt.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Leadstatus uit referrals
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(statusCounts).length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    Nog geen statusdata beschikbaar.
                  </span>
                ) : (
                  Object.entries(statusCounts)
                    .sort((left, right) => right[1] - left[1])
                    .map(([status, count]) => (
                      <Badge
                        key={status}
                        variant={LEAD_STATUS_VARIANT[status as LeadStatus]}
                      >
                        {LEAD_STATUS_LABEL[status as LeadStatus] ?? status}:{" "}
                        {count}
                      </Badge>
                    ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Top doorverwijzers</CardTitle>
            <p className="text-sm text-muted-foreground">
              Leerlingen die het meeste nieuwe verkeer en conversie binnenbrengen.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {topReferrers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Er zijn nog geen doorverwezen aanmeldingen. Leerlingen vinden hun
                persoonlijke link in de app onder &quot;Nodig een vriend uit&quot;.
              </div>
            ) : (
              topReferrers.map((group, index) => (
                <div
                  key={group.studentId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <Link
                        href={`/backoffice/leerlingen/${group.studentId}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {group.studentName ?? "Onbekende leerling"}
                      </Link>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {group.referredLeads.length} referrals, {group.convertedCount}{" "}
                      geconverteerd
                      {group.code ? `, code ${group.code}` : ""}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="success">
                      {group.convertedCount} conversies
                    </Badge>
                    {group.pendingRewardCount > 0 ? (
                      <Badge variant="warning">
                        {group.pendingRewardCount} open rewards
                      </Badge>
                    ) : (
                      <Badge variant="outline">Alles afgehandeld</Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Er zijn nog geen doorverwezen aanmeldingen. Leerlingen vinden hun
              persoonlijke uitnodigingslink in de app onder &quot;Nodig een
              vriend uit&quot;.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.studentId}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-foreground">
                        {group.studentName ?? "Onbekende leerling"}
                      </CardTitle>
                      {group.code ? (
                        <Badge variant="outline">Code {group.code}</Badge>
                      ) : null}
                      <Badge variant="success">
                        {group.convertedCount} conversies
                      </Badge>
                      {group.pendingRewardCount > 0 ? (
                        <Badge variant="warning">
                          {group.pendingRewardCount} reward open
                        </Badge>
                      ) : (
                        <Badge variant="outline">Geen open beloningen</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {group.referredLeads.length}{" "}
                      {group.referredLeads.length === 1
                        ? "doorverwijzing"
                        : "doorverwijzingen"}{" "}
                      gekoppeld aan deze leerling.
                    </p>
                  </div>
                  <Link
                    href={`/backoffice/leerlingen/${group.studentId}`}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Leerlingdossier
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.referredLeads.map((lead) => {
                  const status = lead.status as LeadStatus;
                  const converted =
                    status === "converted" || status === "trial_completed";
                  return (
                    <div
                      key={lead.leadId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {lead.fullName ?? "Naamloos"}
                          </span>
                          <Badge variant={LEAD_STATUS_VARIANT[status]}>
                            {LEAD_STATUS_LABEL[status] ?? status}
                          </Badge>
                          {lead.rewardHandledAt ? (
                            <Badge variant="outline">Reward verwerkt</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {lead.email ?? "geen e-mail"} - aangemeld{" "}
                          {formatDate(lead.createdAt)}
                        </p>
                      </div>
                      {converted ? (
                        <RewardToggle
                          leadId={lead.leadId}
                          handled={lead.rewardHandledAt !== null}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Nog niet geconverteerd
                        </span>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
