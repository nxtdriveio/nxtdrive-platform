import {
  TrendingUp,
  Users,
  Inbox,
  Wallet,
  Receipt,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getDashboardKpis,
  getTodayLessons,
  getLeadsPipeline,
  LEAD_PIPELINE_STAGES,
} from "@/lib/dashboard/metrics";
import { formatEuros } from "@/lib/invoices/types";
import { LEAD_STATUS_LABEL } from "@/lib/leads/types";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type LessonStatus,
} from "@/lib/lessons/types";

export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function BackofficePage() {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const supabase = await createServerSupabaseClient();
  const [metrics, todayLessons, pipeline] = await Promise.all([
    getDashboardKpis(supabase, tenant.id),
    getTodayLessons(supabase, tenant.id),
    getLeadsPipeline(supabase, tenant.id),
  ]);

  const kpis = [
    {
      label: "Actieve leerlingen",
      value: metrics.activeStudents.toLocaleString("nl-NL"),
      hint: "met een actief dossier",
      icon: Users,
    },
    {
      label: "Lessen vandaag",
      value: metrics.lessonsToday.toLocaleString("nl-NL"),
      hint: "geplande lessen vandaag",
      icon: Clock,
    },
    {
      label: "Openstaande leads",
      value: metrics.openLeads.toLocaleString("nl-NL"),
      hint: "nog niet omgezet of afgehaakt",
      icon: Inbox,
    },
    {
      label: "Omzet deze maand",
      value: formatEuros(metrics.revenueThisMonthCents),
      hint: "betaalde facturen deze maand",
      icon: Wallet,
    },
    {
      label: "Nog opvolgen",
      value: metrics.leadsToFollowUp.toLocaleString("nl-NL"),
      hint: "nieuwe leads zonder contact",
      icon: TrendingUp,
    },
    {
      label: "Openstaande facturen",
      value: metrics.openInvoices.toLocaleString("nl-NL"),
      hint: "verzonden, nog niet betaald",
      icon: Receipt,
    },
  ];

  const today = new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const firstName =
    user.profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            {today.charAt(0).toUpperCase() + today.slice(1)} — welkom terug
            {firstName ? `, ${firstName}` : ""}.
          </p>
        </div>
        <Badge variant="primary">
          <ArrowUpRight className="h-3 w-3" aria-hidden />
          {tenant.name}
        </Badge>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{kpi.label}</CardTitle>
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-soft text-primary">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">
                  {kpi.value}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {kpi.hint}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Agenda vandaag</CardTitle>
          </CardHeader>
          <CardContent>
            {todayLessons.length === 0 ? (
              <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                Geen lessen gepland voor vandaag.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {todayLessons.map((lesson) => (
                  <li
                    key={lesson.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-sm tabular-nums text-muted-foreground">
                        {timeFmt.format(new Date(lesson.startsAt))} –{" "}
                        {timeFmt.format(new Date(lesson.endsAt))}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {lesson.studentName}
                      </span>
                    </div>
                    <Badge
                      variant={
                        LESSON_STATUS_VARIANT[lesson.status as LessonStatus]
                      }
                    >
                      {LESSON_STATUS_LABEL[lesson.status as LessonStatus]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads-pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {LEAD_PIPELINE_STAGES.map((stage) => (
                <li
                  key={stage}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">
                    {LEAD_STATUS_LABEL[stage]}
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {pipeline[stage].toLocaleString("nl-NL")}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
