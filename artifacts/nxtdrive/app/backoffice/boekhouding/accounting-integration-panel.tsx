import { AlertTriangle, CheckCircle2, Download, PlugZap } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ACCOUNTING_EXPORT_FORMAT_LABEL,
  ACCOUNTING_EXPORT_FORMATS,
  ACCOUNTING_PROVIDER_LABEL,
  ACCOUNTING_PROVIDERS,
  ACCOUNTING_SYNC_MODE_LABEL,
  ACCOUNTING_SYNC_MODES,
  buildAccountingIntegrationHealth,
  formatVatRate,
  type AccountingIntegrationSettings,
} from "@/lib/accounting/integrations";
import type { AccountingOverview } from "@/lib/accounting/overview";
import { saveAccountingIntegration } from "./actions";

const ACCOUNT_FIELDS = [
  ["debtors", "Debiteuren"],
  ["revenueLessons", "Omzet rijlessen"],
  ["revenuePackages", "Omzet pakketten"],
  ["vatPayable", "BTW af te dragen"],
  ["bank", "Bank"],
  ["paymentProvider", "Betaalprovider"],
  ["suspense", "Tussenrekening"],
] as const;

export function AccountingIntegrationPanel({
  settings,
  overview,
  exportHref,
}: {
  settings: AccountingIntegrationSettings;
  overview: AccountingOverview;
  exportHref: string;
}) {
  const health = buildAccountingIntegrationHealth(settings, overview);
  const statusVariant =
    health.status === "ready"
      ? "success"
      : health.status === "blocked"
        ? "danger"
        : health.status === "attention"
          ? "warning"
          : "outline";

  return (
    <Card>
      <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-base text-foreground">
              <PlugZap className="h-5 w-5 text-primary" aria-hidden />
              Geavanceerde boekhoudkoppelingen
            </CardTitle>
            <Badge variant={statusVariant}>{health.label}</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Richt per klant de boekhoudmapping in voor verkoopfacturen,
            betalingen, BTW-codes, dagboeken en dimensies. De koppeling blijft
            tenant-safe en gebruikt de bestaande factuur- en betaaldata.
          </p>
        </div>
        <div className="min-w-[12rem] rounded-xl border border-border bg-muted/25 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Readiness
          </p>
          <p className="mt-1 text-3xl font-black text-foreground">
            {health.score}%
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${health.score}%` }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <section className="grid gap-3 lg:grid-cols-4">
          {health.checks.map((check) => (
            <div
              key={check.key}
              className="rounded-xl border border-border bg-background px-3 py-3"
            >
              <div className="flex items-start gap-2">
                {check.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      check.severity === "danger" ? "text-danger" : "text-warning"
                    }`}
                  />
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {check.label}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {check.detail}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </section>

        <form action={saveAccountingIntegration} className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="provider">Boekhoudpakket</Label>
              <Select
                id="provider"
                name="provider"
                defaultValue={settings.provider}
              >
                {ACCOUNTING_PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {ACCOUNTING_PROVIDER_LABEL[provider]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="syncMode">Koppelmodus</Label>
              <Select
                id="syncMode"
                name="syncMode"
                defaultValue={settings.syncMode}
              >
                {ACCOUNTING_SYNC_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {ACCOUNTING_SYNC_MODE_LABEL[mode]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exportFormat">Exportprofiel</Label>
              <Select
                id="exportFormat"
                name="exportFormat"
                defaultValue={settings.exportFormat}
              >
                {ACCOUNTING_EXPORT_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {ACCOUNTING_EXPORT_FORMAT_LABEL[format]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="administrationName">Administratienaam</Label>
              <Input
                id="administrationName"
                name="administrationName"
                defaultValue={settings.administrationName}
                placeholder="Bijv. Rijschool BV 2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="administrationId">Administratienummer</Label>
              <Input
                id="administrationId"
                name="administrationId"
                defaultValue={settings.administrationId}
                placeholder="Optioneel"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="relationPrefix">Relatieprefix</Label>
              <Input
                id="relationPrefix"
                name="relationPrefix"
                defaultValue={settings.relationPrefix}
                placeholder="NXT"
              />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)]">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <h3 className="font-semibold text-foreground">
                Grootboekmapping
              </h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="invoiceJournalCode">Verkoopdagboek</Label>
                  <Input
                    id="invoiceJournalCode"
                    name="invoiceJournalCode"
                    defaultValue={settings.invoiceJournalCode}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="paymentJournalCode">Betalingsdagboek</Label>
                  <Input
                    id="paymentJournalCode"
                    name="paymentJournalCode"
                    defaultValue={settings.paymentJournalCode}
                  />
                </div>
                {ACCOUNT_FIELDS.map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`account_${key}`}>{label}</Label>
                    <Input
                      id={`account_${key}`}
                      name={`account_${key}`}
                      defaultValue={settings.accounts[key]}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <h3 className="font-semibold text-foreground">BTW-codes</h3>
              <div className="mt-4 space-y-3">
                {settings.vatMappings.slice(0, 3).map((mapping) => (
                  <div
                    key={mapping.rateBp}
                    className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2"
                  >
                    <input
                      type="hidden"
                      name={`vat_rate_${mapping.rateBp}`}
                      value={mapping.rateBp}
                    />
                    <Label
                      htmlFor={`vat_code_${mapping.rateBp}`}
                      className="pt-2"
                    >
                      {formatVatRate(mapping.rateBp)}
                    </Label>
                    <div className="space-y-2">
                      <Input
                        id={`vat_code_${mapping.rateBp}`}
                        name={`vat_code_${mapping.rateBp}`}
                        defaultValue={mapping.code}
                      />
                      <Input
                        name={`vat_description_${mapping.rateBp}`}
                        defaultValue={mapping.description}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-4">
              <h3 className="font-semibold text-foreground">Dimensies</h3>
              <div className="mt-3 space-y-2">
                <Checkbox
                  name="dimension_branch"
                  label="Vestiging als kostenplaats meesturen"
                  checked={settings.dimensions.branchAsCostCenter}
                />
                <Checkbox
                  name="dimension_instructor"
                  label="Instructeur als projectdimensie voorbereiden"
                  checked={settings.dimensions.instructorAsProject}
                />
                <Checkbox
                  name="dimension_package"
                  label="Pakket/product als artikelcode gebruiken"
                  checked={settings.dimensions.packageAsProduct}
                />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background p-4">
              <h3 className="font-semibold text-foreground">Exportcontroles</h3>
              <div className="mt-3 space-y-2">
                <Checkbox
                  name="enabled"
                  label="Boekhoudkoppeling inschakelen"
                  checked={settings.enabled}
                />
                <Checkbox
                  name="control_paid_only"
                  label="Alleen betaalde facturen exporteren"
                  checked={settings.controls.requirePaidBeforeExport}
                />
                <Checkbox
                  name="control_credit_notes"
                  label="Creditfacturen meenemen"
                  checked={settings.controls.includeCreditNotes}
                />
                <Checkbox
                  name="control_split_vat"
                  label="BTW op aparte regels splitsen"
                  checked={settings.controls.splitVatLines}
                />
                <Checkbox
                  name="control_open_invoices"
                  label="Openstaande facturen meenemen"
                  checked={settings.controls.includeOpenInvoices}
                />
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit">Koppeling opslaan</Button>
            <a
              href={exportHref}
              className={buttonVariants({ variant: "outline" })}
            >
              <Download className="h-4 w-4" aria-hidden />
              Boekhoudbestand exporteren
            </a>
          </div>
        </form>

        <Alert variant={health.status === "blocked" ? "warning" : "info"}>
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <div>
            <AlertTitle>Exportregels</AlertTitle>
            <AlertDescription>
              API-koppelingen worden pas actief nadat mapping, dagboeken en
              grootboeken kloppen. Tot die tijd levert NXTDRIVE hetzelfde
              genormaliseerde journaalbestand, zodat de boekhouder de inrichting
              kan controleren zonder demo- of fallbackdata.
            </AlertDescription>
          </div>
        </Alert>
      </CardContent>
    </Card>
  );
}

function Checkbox({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={checked}
        className="h-4 w-4 rounded border-border"
      />
      <span>{label}</span>
    </label>
  );
}
