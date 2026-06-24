import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountingOverview } from "@/lib/accounting/overview";

export const ACCOUNTING_INTEGRATION_SETTINGS_KEY = "accounting_integration";

export const ACCOUNTING_PROVIDERS = [
  "none",
  "exact_online",
  "moneybird",
  "snelstart",
  "yuki",
  "twinfield",
  "quickbooks",
] as const;
export type AccountingProvider = (typeof ACCOUNTING_PROVIDERS)[number];

export const ACCOUNTING_SYNC_MODES = ["manual_csv", "scheduled_export", "api_ready"] as const;
export type AccountingSyncMode = (typeof ACCOUNTING_SYNC_MODES)[number];

export const ACCOUNTING_EXPORT_FORMATS = ["nxtdrive_journal", "sales_invoices", "payments_reconciliation"] as const;
export type AccountingExportFormat = (typeof ACCOUNTING_EXPORT_FORMATS)[number];

export type AccountingIntegrationSettings = {
  enabled: boolean;
  provider: AccountingProvider;
  syncMode: AccountingSyncMode;
  exportFormat: AccountingExportFormat;
  administrationName: string;
  administrationId: string;
  relationPrefix: string;
  invoiceJournalCode: string;
  paymentJournalCode: string;
  accounts: {
    debtors: string;
    revenueLessons: string;
    revenuePackages: string;
    vatPayable: string;
    bank: string;
    paymentProvider: string;
    suspense: string;
  };
  vatMappings: Array<{
    rateBp: number;
    code: string;
    description: string;
  }>;
  dimensions: {
    branchAsCostCenter: boolean;
    instructorAsProject: boolean;
    packageAsProduct: boolean;
  };
  controls: {
    requirePaidBeforeExport: boolean;
    includeCreditNotes: boolean;
    splitVatLines: boolean;
    includeOpenInvoices: boolean;
  };
};

export const ACCOUNTING_PROVIDER_LABEL: Record<AccountingProvider, string> = {
  none: "Geen koppeling",
  exact_online: "Exact Online",
  moneybird: "Moneybird",
  snelstart: "SnelStart",
  yuki: "Yuki",
  twinfield: "Twinfield",
  quickbooks: "QuickBooks",
};

export const ACCOUNTING_SYNC_MODE_LABEL: Record<AccountingSyncMode, string> = {
  manual_csv: "Handmatige CSV-export",
  scheduled_export: "Geplande export",
  api_ready: "API-ready mapping",
};

export const ACCOUNTING_EXPORT_FORMAT_LABEL: Record<AccountingExportFormat, string> = {
  nxtdrive_journal: "NXTDRIVE journaalposten",
  sales_invoices: "Verkoopfacturen",
  payments_reconciliation: "Betalingen & reconciliatie",
};

export const DEFAULT_ACCOUNTING_INTEGRATION_SETTINGS: AccountingIntegrationSettings = {
  enabled: false,
  provider: "none",
  syncMode: "manual_csv",
  exportFormat: "nxtdrive_journal",
  administrationName: "",
  administrationId: "",
  relationPrefix: "NXT",
  invoiceJournalCode: "VF",
  paymentJournalCode: "BNK",
  accounts: {
    debtors: "1300",
    revenueLessons: "8000",
    revenuePackages: "8010",
    vatPayable: "1500",
    bank: "1100",
    paymentProvider: "1105",
    suspense: "1999",
  },
  vatMappings: [
    { rateBp: 2100, code: "VH", description: "BTW hoog 21%" },
    { rateBp: 900, code: "VL", description: "BTW laag 9%" },
    { rateBp: 0, code: "V0", description: "BTW vrijgesteld / 0%" },
  ],
  dimensions: {
    branchAsCostCenter: true,
    instructorAsProject: false,
    packageAsProduct: true,
  },
  controls: {
    requirePaidBeforeExport: false,
    includeCreditNotes: true,
    splitVatLines: true,
    includeOpenInvoices: true,
  },
};

export type AccountingIntegrationHealth = {
  status: "disabled" | "ready" | "attention" | "blocked";
  score: number;
  label: string;
  checks: Array<{
    key: string;
    label: string;
    ok: boolean;
    severity: "info" | "warning" | "danger";
    detail: string;
  }>;
};

const ACCOUNT_RE = /^[A-Za-z0-9._:-]{2,32}$/;
const JOURNAL_RE = /^[A-Za-z0-9._:-]{1,16}$/;
const PREFIX_RE = /^[A-Za-z0-9_-]{1,12}$/;

export function mergeAccountingIntegrationSettings(
  override: unknown,
): AccountingIntegrationSettings {
  const base = structuredClone(DEFAULT_ACCOUNTING_INTEGRATION_SETTINGS);
  if (!override || typeof override !== "object") return base;
  const o = override as Record<string, unknown>;

  base.enabled = o.enabled === true || o.enabled === "true";
  base.provider = readEnum(o.provider, ACCOUNTING_PROVIDERS, base.provider);
  if (base.provider === "none") base.enabled = false;
  base.syncMode = readEnum(o.syncMode, ACCOUNTING_SYNC_MODES, base.syncMode);
  base.exportFormat = readEnum(
    o.exportFormat,
    ACCOUNTING_EXPORT_FORMATS,
    base.exportFormat,
  );
  base.administrationName = readText(o.administrationName, 80);
  base.administrationId = readText(o.administrationId, 60);
  base.relationPrefix = readCode(o.relationPrefix, PREFIX_RE, base.relationPrefix);
  base.invoiceJournalCode = readCode(
    o.invoiceJournalCode,
    JOURNAL_RE,
    base.invoiceJournalCode,
  );
  base.paymentJournalCode = readCode(
    o.paymentJournalCode,
    JOURNAL_RE,
    base.paymentJournalCode,
  );

  const accounts = readObject(o.accounts);
  for (const key of Object.keys(base.accounts) as Array<keyof typeof base.accounts>) {
    base.accounts[key] = readCode(accounts[key], ACCOUNT_RE, base.accounts[key]);
  }

  const dimensions = readObject(o.dimensions);
  base.dimensions.branchAsCostCenter = readBool(
    dimensions.branchAsCostCenter,
    base.dimensions.branchAsCostCenter,
  );
  base.dimensions.instructorAsProject = readBool(
    dimensions.instructorAsProject,
    base.dimensions.instructorAsProject,
  );
  base.dimensions.packageAsProduct = readBool(
    dimensions.packageAsProduct,
    base.dimensions.packageAsProduct,
  );

  const controls = readObject(o.controls);
  base.controls.requirePaidBeforeExport = readBool(
    controls.requirePaidBeforeExport,
    base.controls.requirePaidBeforeExport,
  );
  base.controls.includeCreditNotes = readBool(
    controls.includeCreditNotes,
    base.controls.includeCreditNotes,
  );
  base.controls.splitVatLines = readBool(
    controls.splitVatLines,
    base.controls.splitVatLines,
  );
  base.controls.includeOpenInvoices = readBool(
    controls.includeOpenInvoices,
    base.controls.includeOpenInvoices,
  );

  base.vatMappings = sanitizeVatMappings(o.vatMappings);

  return base;
}

export async function loadAccountingIntegrationSettings(
  client: SupabaseClient,
  tenantId: string,
): Promise<AccountingIntegrationSettings> {
  const { data, error } = await client
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", ACCOUNTING_INTEGRATION_SETTINGS_KEY)
    .maybeSingle();
  if (error) return mergeAccountingIntegrationSettings(null);
  return mergeAccountingIntegrationSettings(data?.value ?? null);
}

export function buildAccountingIntegrationHealth(
  settings: AccountingIntegrationSettings,
  overview: AccountingOverview,
): AccountingIntegrationHealth {
  const checks: AccountingIntegrationHealth["checks"] = [];
  if (!settings.enabled) {
    return {
      status: "disabled",
      score: 0,
      label: "Niet gekoppeld",
      checks: [
        {
          key: "disabled",
          label: "Koppeling uitgeschakeld",
          ok: false,
          severity: "info",
          detail: "Kies een boekhoudpakket en sla de mapping op om exports te sturen.",
        },
      ],
    };
  }

  checks.push({
    key: "provider",
    label: "Boekhoudpakket gekozen",
    ok: settings.provider !== "none",
    severity: "danger",
    detail:
      settings.provider === "none"
        ? "Kies Exact Online, Moneybird, SnelStart, Yuki, Twinfield of QuickBooks."
        : ACCOUNTING_PROVIDER_LABEL[settings.provider],
  });
  checks.push({
    key: "administration",
    label: "Administratie herleidbaar",
    ok: Boolean(settings.administrationName || settings.administrationId),
    severity: "warning",
    detail:
      settings.administrationName || settings.administrationId
        ? [settings.administrationName, settings.administrationId].filter(Boolean).join(" - ")
        : "Vul administratienaam of administratienummer in.",
  });
  checks.push({
    key: "journals",
    label: "Dagboeken ingesteld",
    ok: Boolean(settings.invoiceJournalCode && settings.paymentJournalCode),
    severity: "danger",
    detail: `Facturen: ${settings.invoiceJournalCode || "-"} / betalingen: ${settings.paymentJournalCode || "-"}`,
  });
  const accountValues = Object.values(settings.accounts);
  checks.push({
    key: "accounts",
    label: "Grootboekrekeningen compleet",
    ok: accountValues.every(Boolean),
    severity: "danger",
    detail: accountValues.every(Boolean)
      ? "Debiteuren, omzet, BTW, bank en tussenrekening zijn gemapt."
      : "Vul alle grootboekrekeningen in voordat je exporteert.",
  });
  const usedVatRates = new Set(overview.vatByRate.map((bucket) => bucket.rateBp));
  const mappedVatRates = new Set(settings.vatMappings.map((mapping) => mapping.rateBp));
  const missingVat = Array.from(usedVatRates).filter((rate) => !mappedVatRates.has(rate));
  checks.push({
    key: "vat",
    label: "BTW-codes dekken actuele facturen",
    ok: missingVat.length === 0,
    severity: "warning",
    detail:
      missingVat.length === 0
        ? "Alle gebruikte BTW-tarieven hebben een boekhoudcode."
        : `Mist BTW-code voor ${missingVat.map(formatVatRate).join(", ")}.`,
  });
  checks.push({
    key: "revenue",
    label: "Export bevat data",
    ok: overview.revenueTotals.totalCents !== 0 || overview.outstanding.length > 0,
    severity: "info",
    detail:
      overview.revenueTotals.totalCents !== 0 || overview.outstanding.length > 0
        ? "Er zijn facturen of open posten beschikbaar voor deze periode."
        : "Geen factuurdata in de gekozen periode.",
  });

  const blocking = checks.some((check) => !check.ok && check.severity === "danger");
  const attention = checks.some((check) => !check.ok);
  const okCount = checks.filter((check) => check.ok).length;
  const score = Math.round((okCount / checks.length) * 100);
  return {
    status: blocking ? "blocked" : attention ? "attention" : "ready",
    score,
    label: blocking ? "Mapping onvolledig" : attention ? "Bijna klaar" : "Klaar voor export",
    checks,
  };
}

export function accountingExportFilename(
  settings: AccountingIntegrationSettings,
  from: string,
  to: string,
): string {
  const provider = settings.provider === "none" ? "nxtdrive" : settings.provider;
  return `boekhoudkoppeling_${provider}_${from}_${to}.csv`;
}

export function formatVatRate(rateBp: number): string {
  return `${(rateBp / 100).toLocaleString("nl-NL")}%`;
}

export function vatCodeForRate(
  settings: AccountingIntegrationSettings,
  rateBp: number,
): string {
  return (
    settings.vatMappings.find((mapping) => mapping.rateBp === rateBp)?.code ??
    DEFAULT_ACCOUNTING_INTEGRATION_SETTINGS.vatMappings.find(
      (mapping) => mapping.rateBp === rateBp,
    )?.code ??
    `BTW${rateBp}`
  );
}

function sanitizeVatMappings(value: unknown): AccountingIntegrationSettings["vatMappings"] {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set<number>();
  const result: AccountingIntegrationSettings["vatMappings"] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const rateBp = Math.round(Number(r.rateBp));
    if (!Number.isFinite(rateBp) || rateBp < 0 || rateBp > 2500) continue;
    const code = readCode(r.code, JOURNAL_RE, "");
    if (!code || seen.has(rateBp)) continue;
    seen.add(rateBp);
    result.push({
      rateBp,
      code,
      description: readText(r.description, 80) || `BTW ${formatVatRate(rateBp)}`,
    });
  }
  for (const fallback of DEFAULT_ACCOUNTING_INTEGRATION_SETTINGS.vatMappings) {
    if (!seen.has(fallback.rateBp)) result.push(fallback);
  }
  return result.sort((a, b) => b.rateBp - a.rateBp);
}

function readEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && allowed.includes(value)
    ? value
    : fallback;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function readText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function readCode(value: unknown, regex: RegExp, fallback: string): string {
  const text = readText(value, 32);
  return text && regex.test(text) ? text : fallback;
}
