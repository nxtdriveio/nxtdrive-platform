import Link from "next/link";
import { Download, TrendingUp, TrendingDown, Users, Inbox, Wallet, CheckCircle2, XCircle, Clock, AlertCircle, Star } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatEuros } from "@/lib/invoices/types";
import {
  getMonthlyRevenue,
  getRapportagesKpis,
  getConversionFunnel,
  getMarketingSources,
  getLessonStats,
  getExamStats,
  getTopTegoed,
  getOpenInvoiceSummary,
  getStudentsWithoutNextLesson,
  loadTenantReviewOverview,
  trendPct,
  monthStart,
  monthEnd,
  monthKeyOffset,
  monthLabel,
} from "@/lib/dashboard/reports-data";
import { getReport, normalizeYmd } from "@/lib/dashboard/metrics";
import { loadTenantQualityOverview } from "@/lib/reports/quality-overview";
import {
  QualityKpis,
  PhaseDistribution,
  InstructorProgressTable,
  StudentReadinessTable,
} from "@/components/backoffice/reports/quality";
import { RevenueBarChart } from "@/components/charts/RevenueBarChart";
import { DonutChart } from "@/components/charts/DonutChart";

export const dynamic = "force-dynamic";

const AVATAR_COLORS = [
  "bg-amber-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-rose-500",
];

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${
        up ? "text-emerald-400" : "text-red-400"
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

function StarRating({ value }: { value: number | null }) {
  const stars = Math.round((value ?? 0) * 2) / 2;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-4 w-4 ${
            s <= Math.floor(stars)
              ? "fill-amber-400 text-amber-400"
              : s - 0.5 === stars
                ? "fill-amber-400/50 text-amber-400"
                : "fill-transparent text-muted-foreground/40"
          }`}
        />
      ))}
    </div>
  );
}

/** Build the last 12 month option values for the month selector. */
function buildMonthOptions(): { value: string; label: string }[] {
  const opts = [];
  for (let i = 0; i < 12; i++) {
    const key = monthKeyOffset(i);
    const [y, m] = key.split("-");
    const date = new Date(Number(y), Number(m) - 1, 15);
    const label = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(date);
    opts.push({ value: key, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts;
}

export default async function RapportagesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);
  const supabase = await createServerSupabaseClient();
  const params = await searchParams;

  // Month selector
  const currentMonthKey = monthKeyOffset(0);
  const selectedMonth =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentMonthKey;

  const cStart = monthStart(selectedMonth);
  const cEnd = monthEnd(selectedMonth);

  // For the date-range table (keep backward compat with from/to)
  const [y, m] = selectedMonth.split("-");
  const lastDayOfMonth = new Date(Number(y), Number(m), 0).getDate();
  const defaultFrom = `${selectedMonth}-01`;
  const defaultTo = `${selectedMonth}-${String(lastDayOfMonth).padStart(2, "0")}`;

  const from = normalizeYmd(params.from) ?? defaultFrom;
  const to = (normalizeYmd(params.to) ?? defaultTo) < from ? from : (normalizeYmd(params.to) ?? defaultTo);

  const exportHref = `/backoffice/rapportages/export?from=${from}&to=${to}`;
  const monthOptions = buildMonthOptions();

  // Load all data in parallel
  const [kpis, monthlyRevenue, funnel, sources, lessons, review, quality, topTegoed, openInvoices, studentsWithout, report] =
    await Promise.all([
      getRapportagesKpis(supabase, tenant.id, selectedMonth),
      getMonthlyRevenue(supabase, tenant.id, 6),
      getConversionFunnel(supabase, tenant.id, cStart, cEnd),
      getMarketingSources(supabase, tenant.id),
      getLessonStats(supabase, tenant.id, cStart, cEnd),
      loadTenantReviewOverview(supabase, tenant.id),
      loadTenantQualityOverview(supabase, tenant.id),
      getTopTegoed(supabase, tenant.id, 5),
      getOpenInvoiceSummary(supabase, tenant.id),
      getStudentsWithoutNextLesson(supabase, tenant.id),
      getReport(supabase, tenant.id, from, to),
    ]);

  // Pass bijna-examenrijp count from quality to exam stats
  const exams = await getExamStats(supabase, tenant.id, cStart, cEnd, quality.bijnaExamenrijpCount);

  const selectedLabel = monthOptions.find((o) => o.value === selectedMonth)?.label ?? selectedMonth;

  const kpiCards = [
    {
      label: "Nieuwe aanvragen",
      value: kpis.leadsThisMonth,
      prev: kpis.leadsPrevMonth,
      icon: Inbox,
      hint: "leads binnengekomen",
    },
    {
      label: "Proeflessen",
      value: kpis.trialLessonsThisMonth,
      prev: kpis.trialLessonsPrevMonth,
      icon: Clock,
      hint: "bevestigd of gepland",
    },
    {
      label: "Actieve leerlingen",
      value: kpis.activeStudents,
      prev: null as null | number,
      icon: Users,
      hint: "met een actief dossier",
    },
    {
      label: "Omzet",
      value: kpis.revenueThisMonthCents,
      prev: kpis.revenuePrevMonthCents,
      icon: Wallet,
      hint: "betaalde facturen",
      isMoney: true,
    },
  ];

  const dateFmt = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  function formatYmd(ymd: string): string {
    return dateFmt.format(new Date(`${ymd}T12:00:00Z`));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Rapportages
          </h1>
          <p className="text-sm text-muted-foreground">
            Overzicht van {tenant.name} — actuele data uit het systeem.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form method="get" className="flex items-center gap-2">
            <select
              name="month"
              defaultValue={selectedMonth}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Tonen
            </button>
          </form>
          <Link
            href={exportHref}
            prefetch={false}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="h-4 w-4" aria-hidden />
            CSV
          </Link>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          const trend = kpi.prev !== null ? trendPct(kpi.value, kpi.prev) : null;
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
                  {kpi.isMoney ? formatEuros(kpi.value) : kpi.value.toLocaleString("nl-NL")}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">{kpi.hint}</p>
                  <TrendBadge pct={trend} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* ── Revenue chart + Funnel ── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Omzet per maand</CardTitle>
              <span className="text-xs text-muted-foreground">
                laatste 6 maanden — stippellijn = gemiddelde
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <RevenueBarChart data={monthlyRevenue} height={200} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversietrechter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {[
              { label: "Aanvragen", value: funnel.aanvragen, pct: 100 },
              {
                label: "Proefles gepland",
                value: funnel.proeflessen,
                pct: funnel.proeflesToAanvragenPct,
              },
              {
                label: "Pakket gekocht",
                value: funnel.pakket,
                pct: funnel.pakketToProeflesPct,
              },
            ].map((step, i) => (
              <div key={step.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-foreground">{step.label}</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {step.value}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      i === 2 ? "bg-emerald-500" : "bg-primary"
                    }`}
                    style={{ width: `${step.pct}%` }}
                  />
                </div>
                {i > 0 && (
                  <p className="mt-0.5 text-right text-xs text-muted-foreground">
                    {step.pct}% conversie
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* ── Marketing / Les / Examen / Review ── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Marketingbronnen */}
        <Card>
          <CardHeader>
            <CardTitle>Marketingbronnen</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen brondata beschikbaar.</p>
            ) : (
              <DonutChart data={sources} />
            )}
          </CardContent>
        </Card>

        {/* Lesstatistieken */}
        <Card>
          <CardHeader>
            <CardTitle>Lesstatistieken — {selectedLabel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-2">
            {[
              {
                label: "Gereden",
                value: lessons.completed,
                icon: CheckCircle2,
                color: "text-emerald-400",
              },
              {
                label: "Gepland",
                value: lessons.planned,
                icon: Clock,
                color: "text-blue-400",
              },
              {
                label: "Geannuleerd",
                value: lessons.cancelled,
                icon: XCircle,
                color: "text-red-400",
              },
              {
                label: "Te laat geannuleerd",
                value: lessons.lateCancel,
                icon: AlertCircle,
                color: "text-warning",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Icon className={`h-3.5 w-3.5 ${item.color}`} aria-hidden />
                    {item.label}
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {item.value.toLocaleString("nl-NL")}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Examenresultaten */}
        <Card>
          <CardHeader>
            <CardTitle>Examenresultaten — {selectedLabel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-2">
            {[
              {
                label: "Geslaagd",
                value: exams.passed,
                icon: CheckCircle2,
                color: "text-emerald-400",
              },
              {
                label: "Gezakt",
                value: exams.failed,
                icon: XCircle,
                color: "text-red-400",
              },
              {
                label: "Bijna examenrijp",
                value: exams.bijnaExamenrijp,
                icon: Clock,
                color: "text-amber-400",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Icon className={`h-3.5 w-3.5 ${item.color}`} aria-hidden />
                    {item.label}
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {item.value.toLocaleString("nl-NL")}
                  </span>
                </div>
              );
            })}
            {exams.passPct !== null && (
              <div className="mt-2 border-t border-border pt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Slagingspercentage</span>
                  <span className="font-bold text-emerald-400">{exams.passPct}%</span>
                </div>
              </div>
            )}
            {exams.passed === 0 && exams.failed === 0 && (
              <p className="text-xs text-muted-foreground">Geen examens afgelegd in dit tijdvak.</p>
            )}
          </CardContent>
        </Card>

        {/* Reviewscore */}
        <Card>
          <CardHeader>
            <CardTitle>Reviewscore</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {review.count === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen reviews ontvangen.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold text-foreground">
                    {review.average?.toFixed(1) ?? "—"}
                  </span>
                  <div>
                    <StarRating value={review.average} />
                    <p className="text-xs text-muted-foreground">
                      {review.count} review{review.count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  {([5, 4, 3, 2, 1] as const).map((star) => {
                    const count = review.distribution[star];
                    const pct = review.count > 0 ? Math.round((count / review.count) * 100) : 0;
                    return (
                      <div key={star} className="flex items-center gap-2 text-xs">
                        <span className="w-2 text-muted-foreground">{star}</span>
                        <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-5 text-right tabular-nums text-muted-foreground">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Tegoed / Open facturen / Zonder afspraak ── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Resterende tegoeden */}
        <Card>
          <CardHeader>
            <CardTitle>Resterende tegoeden</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {topTegoed.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen leerlingen met saldo.</p>
            ) : (
              <ul className="space-y-2.5">
                {topTegoed.map((row, i) => {
                  const hours = Math.round(row.balanceMinutes / 60);
                  return (
                    <li key={row.studentId} className="flex items-center gap-3 text-sm">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                      >
                        {row.initials}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground">{row.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {hours} les{hours !== 1 ? "sen" : ""} over
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Openstaande facturen */}
        <Card>
          <CardHeader>
            <CardTitle>Openstaande facturen</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {openInvoices.count === 0 ? (
              <p className="text-sm text-muted-foreground">Geen openstaande facturen.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-3xl font-bold text-foreground">
                    {openInvoices.count}
                  </div>
                  <p className="text-xs text-muted-foreground">openstaande facturen</p>
                </div>
                <div>
                  <div className="text-xl font-semibold text-foreground">
                    {formatEuros(openInvoices.totalCents)}
                  </div>
                  <p className="text-xs text-muted-foreground">totaal openstaand</p>
                </div>
                <Link
                  href="/backoffice/facturen"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Bekijk facturen →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leerlingen zonder vervolgafspraak */}
        <Card>
          <CardHeader>
            <CardTitle>Zonder vervolgafspraak</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="text-3xl font-bold text-foreground">
              {studentsWithout}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {studentsWithout === 1
                ? "actieve leerling heeft geen volgende les gepland"
                : "actieve leerlingen hebben geen volgende les gepland"}
            </p>
            {studentsWithout > 0 && (
              <div className="mt-3">
                <Link
                  href="/backoffice/leerlingen"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Leerlingen bekijken →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Dagelijkse uitsplitsing (periode-tabel) ── */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Dagelijkse activiteit — {formatYmd(from)} t/m {formatYmd(to)}</CardTitle>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 text-right font-medium">Lessen gegeven</th>
                <th className="px-4 py-3 text-right font-medium">Omzet</th>
                <th className="px-4 py-3 text-right font-medium">Nieuwe leads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.rows.map((row) => (
                <tr key={row.date}>
                  <td className="px-4 py-2.5 text-foreground">{formatYmd(row.date)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                    {row.lessonsGiven.toLocaleString("nl-NL")}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                    {formatEuros(row.revenueCents)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                    {row.newLeads.toLocaleString("nl-NL")}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/40 font-semibold">
              <tr>
                <td className="px-4 py-3 text-foreground">Totaal</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {report.totals.lessonsGiven.toLocaleString("nl-NL")}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatEuros(report.totals.revenueCents)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {report.totals.newLeads.toLocaleString("nl-NL")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ── Examenrijpheid & kwaliteit (existing section) ── */}
      <div className="border-t border-border pt-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Examenrijpheid &amp; kwaliteit
        </h2>
        <p className="text-sm text-muted-foreground">
          Actuele stand op basis van de leskaart — onafhankelijk van de gekozen periode.
        </p>
      </div>

      <QualityKpis data={quality} />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PhaseDistribution data={quality} />
        <InstructorProgressTable instructors={quality.instructors} />
      </section>

      <StudentReadinessTable students={quality.students} />
    </div>
  );
}
