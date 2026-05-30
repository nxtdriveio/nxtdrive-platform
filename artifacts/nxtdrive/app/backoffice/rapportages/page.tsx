import Link from "next/link";
import { Download } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatEuros } from "@/lib/invoices/types";
import {
  getReport,
  defaultReportRange,
  normalizeYmd,
} from "@/lib/dashboard/metrics";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatYmd(ymd: string): string {
  return dateFmt.format(new Date(`${ymd}T12:00:00Z`));
}

export default async function RapportagesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);
  const supabase = await createServerSupabaseClient();

  const params = await searchParams;
  const fallback = defaultReportRange();
  const from = normalizeYmd(params.from) ?? fallback.from;
  const toRaw = normalizeYmd(params.to) ?? fallback.to;
  const to = toRaw < from ? from : toRaw;

  const report = await getReport(supabase, tenant.id, from, to);
  const exportHref = `/backoffice/rapportages/export?from=${from}&to=${to}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Rapportages
        </h1>
        <p className="text-sm text-muted-foreground">
          Activiteit van {tenant.name} per dag. Omzet komt uit betaalde
          facturen.
        </p>
      </div>

      <Card>
        <CardContent>
          <form
            method="get"
            className="flex flex-wrap items-end gap-4 pt-6"
          >
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
            <Link
              href={exportHref}
              prefetch={false}
              className={buttonVariants({ variant: "outline" })}
            >
              <Download className="h-4 w-4" aria-hidden />
              Exporteer CSV
            </Link>
          </form>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Lessen gegeven</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              {report.totals.lessonsGiven.toLocaleString("nl-NL")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              voltooide lessen in periode
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Omzet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              {formatEuros(report.totals.revenueCents)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              betaalde facturen in periode
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Nieuwe leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              {report.totals.newLeads.toLocaleString("nl-NL")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              binnengekomen in periode
            </p>
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Datum</th>
              <th className="px-4 py-3 text-right font-medium">
                Lessen gegeven
              </th>
              <th className="px-4 py-3 text-right font-medium">Omzet</th>
              <th className="px-4 py-3 text-right font-medium">Nieuwe leads</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.rows.map((row) => (
              <tr key={row.date}>
                <td className="px-4 py-2.5 text-foreground">
                  {formatYmd(row.date)}
                </td>
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
      </Card>
    </div>
  );
}
