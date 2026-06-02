import Link from "next/link";
import { Download } from "lucide-react";
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

      {/* Omzetoverzicht */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Omzetoverzicht</CardTitle>
        </CardHeader>
        <table className="w-full text-sm">
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
          <table className="w-full text-sm">
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
          <table className="w-full text-sm">
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
        )}
      </Card>

      {/* Maandrapportage */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Maandrapportage</CardTitle>
        </CardHeader>
        <table className="w-full text-sm">
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
