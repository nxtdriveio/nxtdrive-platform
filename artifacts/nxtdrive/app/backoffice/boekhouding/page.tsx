import Link from "next/link";
import { AlertTriangle, Download, Receipt, Wallet } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_VARIANT,
  formatEuros,
} from "@/lib/invoices/types";
import { normalizeYmd } from "@/lib/dashboard/metrics";
import {
  getAccountingOverview,
  defaultAccountingRange,
} from "@/lib/accounting/overview";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const monthFmt = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  month: "long",
  year: "numeric",
});

function formatYmd(ymd: string): string {
  return dateFmt.format(new Date(`${ymd}T12:00:00Z`));
}
function formatMonth(key: string): string {
  return monthFmt.format(new Date(`${key}-01T12:00:00Z`));
}
function formatRate(rateBp: number): string {
  return `${(rateBp / 100).toLocaleString("nl-NL")}%`;
}

function FinanceStatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-sm">{label}</CardTitle>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        <span className="rounded-full bg-primary-soft p-2 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default async function BoekhoudingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const supabase = await createServerSupabaseClient();

  const params = await searchParams;
  const fallback = defaultAccountingRange();
  const from = normalizeYmd(params.from) ?? fallback.from;
  const toRaw = normalizeYmd(params.to) ?? fallback.to;
  const to = toRaw < from ? from : toRaw;

  const overview = await getAccountingOverview(supabase, tenant.id, from, to);

  const q = `?from=${from}&to=${to}`;
  const exportFacturen = `/backoffice/boekhouding/export/facturen${q}`;
  const exportBetalingen = `/backoffice/boekhouding/export/betalingen${q}`;
  const exportKlanten = `/backoffice/boekhouding/export/klanten`;
  const overdueInvoices = overview.outstanding.filter((invoice) => invoice.daysOverdue > 0);
  const oldestOutstanding = overdueInvoices[0] ?? overview.outstanding[0] ?? null;
  const latestMonth = overview.monthly[overview.monthly.length - 1] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Boekhouding &amp; export
        </h1>
        <p className="text-sm text-muted-foreground">
          Financieel overzicht van {tenant.name}. Omzet en BTW komen uit
          betaalde facturen; creditfacturen worden automatisch verrekend.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceStatCard
          label="Betaalde omzet"
          value={formatEuros(overview.revenueTotals.totalCents)}
          hint={`Periode ${formatYmd(from)} t/m ${formatYmd(to)}`}
          icon={Wallet}
        />
        <FinanceStatCard
          label="BTW af te dragen"
          value={formatEuros(overview.vatTotals.vatCents)}
          hint={
            overview.vatByRate.length > 0
              ? `${overview.vatByRate.length} BTW-tarief${overview.vatByRate.length === 1 ? "" : "en"} actief`
              : "Nog geen betaalde facturen in deze periode"
          }
          icon={Receipt}
        />
        <FinanceStatCard
          label="Openstaand"
          value={formatEuros(overview.outstandingTotalCents)}
          hint={`${overview.outstanding.length} open factuur${overview.outstanding.length === 1 ? "" : "en"}`}
          icon={AlertTriangle}
        />
        <FinanceStatCard
          label="Lopende maand"
          value={latestMonth ? formatEuros(latestMonth.totalCents) : formatEuros(0)}
          hint={
            latestMonth
              ? `${formatMonth(latestMonth.month)} · ${formatEuros(latestMonth.outstandingCents)} nog open`
              : "Nog geen maanddata opgebouwd"
          }
          icon={Download}
        />
      </section>

      <Card>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-4 pt-6">
            <div className="space-y-1.5">
              <Label htmlFor="from">Van</Label>
              <Input
                id="from"
                name="from"
                type="date"
                defaultValue={from}
                className="w-44"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">Tot en met</Label>
              <Input
                id="to"
                name="to"
                type="date"
                defaultValue={to}
                className="w-44"
              />
            </div>
            <Button type="submit">Toepassen</Button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <Link
              href={exportFacturen}
              prefetch={false}
              className={buttonVariants({ variant: "outline" })}
            >
              <Download className="h-4 w-4" aria-hidden />
              Factuurexport
            </Link>
            <Link
              href={exportBetalingen}
              prefetch={false}
              className={buttonVariants({ variant: "outline" })}
            >
              <Download className="h-4 w-4" aria-hidden />
              Betalingenexport
            </Link>
            <Link
              href={exportKlanten}
              prefetch={false}
              className={buttonVariants({ variant: "outline" })}
            >
              <Download className="h-4 w-4" aria-hidden />
              Klantenexport
            </Link>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Financiële aandacht</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {oldestOutstanding ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Factuur #{String(oldestOutstanding.invoiceNo).padStart(4, "0")} vraagt opvolging
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {oldestOutstanding.studentName} ·{" "}
                      {oldestOutstanding.dueDate
                        ? `verviel op ${formatYmd(oldestOutstanding.dueDate)}`
                        : "geen vervaldatum ingesteld"}
                    </p>
                  </div>
                  <Badge variant={DISPLAY_STATUS_VARIANT[oldestOutstanding.display]}>
                    {DISPLAY_STATUS_LABEL[oldestOutstanding.display]}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>{formatEuros(oldestOutstanding.totalCents)}</span>
                  <span>
                    {oldestOutstanding.daysOverdue > 0
                      ? `${oldestOutstanding.daysOverdue} dagen te laat`
                      : "Nog binnen betaaltermijn"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-700 dark:text-emerald-300">
                Geen openstaande opvolgpunten. Alle facturen in deze selectie zijn verwerkt of op tijd.
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Open posten met risico
                </p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {overdueInvoices.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  Facturen die al voorbij de vervaldatum zijn.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  BTW grondslag
                </p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {formatEuros(overview.vatTotals.baseCents)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Totale basis waarover BTW in deze periode is berekend.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Export & vervolgstappen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href={exportFacturen}
              prefetch={false}
              className={buttonVariants({ variant: "outline" }) + " w-full justify-start"}
            >
              <Download className="h-4 w-4" aria-hidden />
              Facturen exporteren
            </Link>
            <Link
              href={exportBetalingen}
              prefetch={false}
              className={buttonVariants({ variant: "outline" }) + " w-full justify-start"}
            >
              <Download className="h-4 w-4" aria-hidden />
              Betalingen exporteren
            </Link>
            <Link
              href={exportKlanten}
              prefetch={false}
              className={buttonVariants({ variant: "outline" }) + " w-full justify-start"}
            >
              <Download className="h-4 w-4" aria-hidden />
              Klanten exporteren
            </Link>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Gebruik deze exports voor boekhouder, reconciliatie of maandafsluiting. Openstaande posten blijven hieronder direct zichtbaar voor opvolging.
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Omzetoverzicht */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Omzetoverzicht</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="border-y border-border bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Maand</th>
              <th className="px-4 py-3 text-right font-medium">Subtotaal</th>
              <th className="px-4 py-3 text-right font-medium">BTW</th>
              <th className="px-4 py-3 text-right font-medium">Totaal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {overview.monthly.map((m) => (
              <tr key={m.month}>
                <td className="px-4 py-2.5 capitalize text-foreground">
                  {formatMonth(m.month)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatEuros(m.subtotalCents)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatEuros(m.taxCents)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatEuros(m.totalCents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-muted/40 font-semibold">
            <tr>
              <td className="px-4 py-3 text-foreground">Totaal</td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                {formatEuros(overview.revenueTotals.subtotalCents)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                {formatEuros(overview.revenueTotals.taxCents)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                {formatEuros(overview.revenueTotals.totalCents)}
              </td>
            </tr>
          </tfoot>
        </table>
        </div>
      </Card>

      {/* BTW-overzicht */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>BTW-overzicht</CardTitle>
        </CardHeader>
        {overview.vatByRate.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Geen betaalde facturen in deze periode.
            </p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm">
            <thead className="border-y border-border bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">BTW-tarief</th>
                <th className="px-4 py-3 text-right font-medium">Grondslag</th>
                <th className="px-4 py-3 text-right font-medium">BTW</th>
                <th className="px-4 py-3 text-right font-medium">Bruto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overview.vatByRate.map((r) => (
                <tr key={r.rateBp}>
                  <td className="px-4 py-2.5 text-foreground">
                    {formatRate(r.rateBp)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                    {formatEuros(r.baseCents)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                    {formatEuros(r.vatCents)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                    {formatEuros(r.grossCents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/40 font-semibold">
              <tr>
                <td className="px-4 py-3 text-foreground">Totaal</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatEuros(overview.vatTotals.baseCents)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatEuros(overview.vatTotals.vatCents)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatEuros(overview.vatTotals.grossCents)}
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </Card>

      {/* Openstaande posten */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Openstaande posten</CardTitle>
        </CardHeader>
        {overview.outstanding.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Geen openstaande facturen. 🎉
            </p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-y border-border bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Factuur</th>
                <th className="px-4 py-3 font-medium">Leerling</th>
                <th className="px-4 py-3 font-medium">Factuurdatum</th>
                <th className="px-4 py-3 font-medium">Vervaldatum</th>
                <th className="px-4 py-3 text-right font-medium">Dagen te laat</th>
                <th className="px-4 py-3 text-right font-medium">Bedrag</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overview.outstanding.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2.5 text-foreground">
                    <Link
                      href={`/backoffice/facturen/${o.id}`}
                      className="hover:underline"
                    >
                      #{String(o.invoiceNo).padStart(4, "0")}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-foreground">{o.studentName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {o.issuedAt ? formatYmd(o.issuedAt.slice(0, 10)) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {o.dueDate ? formatYmd(o.dueDate) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                    {o.daysOverdue > 0 ? o.daysOverdue : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                    {formatEuros(o.totalCents)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={DISPLAY_STATUS_VARIANT[o.display]}>
                      {DISPLAY_STATUS_LABEL[o.display]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/40 font-semibold">
              <tr>
                <td className="px-4 py-3 text-foreground" colSpan={5}>
                  Totaal openstaand
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatEuros(overview.outstandingTotalCents)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </Card>

      {/* Maandrapportage */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Maandrapportage</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="border-y border-border bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Maand</th>
              <th className="px-4 py-3 text-right font-medium">Omzet (excl. BTW)</th>
              <th className="px-4 py-3 text-right font-medium">BTW</th>
              <th className="px-4 py-3 text-right font-medium">Omzet (incl. BTW)</th>
              <th className="px-4 py-3 text-right font-medium">Openstaand</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {overview.monthly.map((m) => (
              <tr key={m.month}>
                <td className="px-4 py-2.5 capitalize text-foreground">
                  {formatMonth(m.month)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatEuros(m.subtotalCents)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatEuros(m.taxCents)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatEuros(m.totalCents)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatEuros(m.outstandingCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <CardContent>
          <p className="pt-4 text-xs text-muted-foreground">
            Omzet is toegerekend aan de maand waarin de factuur is betaald.
            Openstaand toont facturen die in die maand zijn verstuurd en nog niet
            betaald zijn.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
