import { type NextRequest } from "next/server";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdvancedReportExportAccess } from "@/lib/platform/commercial-access";
import {
  startOfDayUtc,
  addDays,
  amsterdamYmd,
  normalizeYmd,
} from "@/lib/dashboard/metrics";
import { defaultAccountingRange } from "@/lib/accounting/overview";
import { buildCsv, csvResponse, eurosNl } from "@/lib/accounting/csv";
import {
  accountingExportFilename,
  loadAccountingIntegrationSettings,
  vatCodeForRate,
} from "@/lib/accounting/integrations";
import type { Invoice, InvoiceKind, InvoiceStatus } from "@/lib/invoices/types";
import type { Student } from "@/lib/students/types";

export const dynamic = "force-dynamic";

type InvoiceRow = Pick<
  Invoice,
  | "id"
  | "branch_id"
  | "invoice_no"
  | "kind"
  | "status"
  | "student_id"
  | "issued_at"
  | "paid_at"
  | "subtotal_cents"
  | "tax_cents"
  | "total_cents"
  | "amount_paid_cents"
>;

type LineRow = {
  invoice_id: string;
  description: string;
  amount_cents: number;
  tax_amount_cents: number;
  tax_rate_bp: number;
  related_package_id: string | null;
};

export async function GET(request: NextRequest) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const blocked = await requireAdvancedReportExportAccess(tenant.id);
  if (blocked) return blocked;

  const supabase = await createServerSupabaseClient();
  const settings = await loadAccountingIntegrationSettings(supabase, tenant.id);

  const sp = request.nextUrl.searchParams;
  const fallback = defaultAccountingRange();
  const from = normalizeYmd(sp.get("from")) ?? fallback.from;
  const toRaw = normalizeYmd(sp.get("to")) ?? fallback.to;
  const to = toRaw < from ? from : toRaw;
  const rangeStart = startOfDayUtc(from).toISOString();
  const rangeEnd = startOfDayUtc(addDays(to, 1)).toISOString();

  let invoiceQuery = supabase
    .from("invoices")
    .select(
      "id, branch_id, invoice_no, kind, status, student_id, issued_at, paid_at, subtotal_cents, tax_cents, total_cents, amount_paid_cents",
    )
    .eq("tenant_id", tenant.id)
    .neq("status", "draft")
    .gte("issued_at", rangeStart)
    .lt("issued_at", rangeEnd)
    .order("invoice_no", { ascending: true });

  if (settings.controls.requirePaidBeforeExport) {
    invoiceQuery = invoiceQuery.eq("status", "paid");
  } else if (!settings.controls.includeOpenInvoices) {
    invoiceQuery = invoiceQuery.neq("status", "open");
  }
  if (!settings.controls.includeCreditNotes) {
    invoiceQuery = invoiceQuery.eq("kind", "invoice");
  }

  const { data: invoicesRaw, error: invoiceErr } = await invoiceQuery;
  if (invoiceErr) {
    throw new Error(`boekhoudkoppeling invoices read failed: ${invoiceErr.message}`);
  }
  const invoices = (invoicesRaw ?? []) as InvoiceRow[];
  const invoiceIds = invoices.map((invoice) => invoice.id);

  const studentIds = Array.from(new Set(invoices.map((invoice) => invoice.student_id)));
  const nameMap = new Map<string, string>();
  if (studentIds.length > 0) {
    const { data: students, error: studentErr } = await supabase
      .from("students")
      .select("id, full_name")
      .eq("tenant_id", tenant.id)
      .in("id", studentIds);
    if (studentErr) {
      throw new Error(`boekhoudkoppeling students read failed: ${studentErr.message}`);
    }
    for (const student of (students ?? []) as Pick<Student, "id" | "full_name">[]) {
      nameMap.set(student.id, student.full_name);
    }
  }

  let linesByInvoice = new Map<string, LineRow[]>();
  if (invoiceIds.length > 0) {
    const { data: lines, error: linesErr } = await supabase
      .from("invoice_lines")
      .select(
        "invoice_id, description, amount_cents, tax_amount_cents, tax_rate_bp, related_package_id",
      )
      .eq("tenant_id", tenant.id)
      .in("invoice_id", invoiceIds)
      .order("position", { ascending: true });
    if (linesErr) {
      throw new Error(`boekhoudkoppeling lines read failed: ${linesErr.message}`);
    }
    linesByInvoice = groupByInvoice((lines ?? []) as LineRow[]);
  }

  const header = [
    "Administratie",
    "Provider",
    "Exportprofiel",
    "Boekdatum",
    "Dagboek",
    "Factuurnummer",
    "Relatiecode",
    "Relatienaam",
    "Regeltype",
    "Grootboek",
    "Omschrijving",
    "Debet (EUR)",
    "Credit (EUR)",
    "BTW-code",
    "BTW-tarief",
    "Dimensie vestiging",
    "Status",
  ];

  const rows: string[][] = [];
  for (const invoice of invoices) {
    const invoiceDate = invoice.issued_at
      ? amsterdamYmd(new Date(invoice.issued_at))
      : from;
    const relationCode = `${settings.relationPrefix}-${invoice.student_id.slice(0, 8)}`;
    const relationName = nameMap.get(invoice.student_id) ?? "Onbekend";
    const sign = invoice.kind === "credit_note" ? -1 : 1;
    const status = invoice.status as InvoiceStatus;
    const kind = invoice.kind as InvoiceKind;
    const lineRows = linesByInvoice.get(invoice.id) ?? [];

    rows.push(
      buildRow({
        settings,
        date: invoiceDate,
        journal: settings.invoiceJournalCode,
        invoiceNo: invoice.invoice_no,
        relationCode,
        relationName,
        rowType: kind === "credit_note" ? "creditfactuur debiteur" : "factuur debiteur",
        account: settings.accounts.debtors,
        description: "Debiteurenboeking",
        debitCents: sign > 0 ? invoice.total_cents : 0,
        creditCents: sign < 0 ? Math.abs(invoice.total_cents) : 0,
        vatCode: "",
        vatRate: "",
        branchId: settings.dimensions.branchAsCostCenter ? invoice.branch_id : null,
        status,
      }),
    );

    for (const line of lineRows) {
      const revenueAccount = line.related_package_id
        ? settings.accounts.revenuePackages
        : settings.accounts.revenueLessons;
      rows.push(
        buildRow({
          settings,
          date: invoiceDate,
          journal: settings.invoiceJournalCode,
          invoiceNo: invoice.invoice_no,
          relationCode,
          relationName,
          rowType: "omzetregel",
          account: revenueAccount,
          description: line.description,
          debitCents: sign < 0 ? Math.abs(line.amount_cents) : 0,
          creditCents: sign > 0 ? line.amount_cents : 0,
          vatCode: settings.controls.splitVatLines ? "" : vatCodeForRate(settings, line.tax_rate_bp),
          vatRate: settings.controls.splitVatLines ? "" : String(line.tax_rate_bp),
          branchId: settings.dimensions.branchAsCostCenter ? invoice.branch_id : null,
          status,
        }),
      );
      if (settings.controls.splitVatLines && line.tax_amount_cents !== 0) {
        rows.push(
          buildRow({
            settings,
            date: invoiceDate,
            journal: settings.invoiceJournalCode,
            invoiceNo: invoice.invoice_no,
            relationCode,
            relationName,
            rowType: "btw-regel",
            account: settings.accounts.vatPayable,
            description: `BTW ${line.description}`,
            debitCents: sign < 0 ? Math.abs(line.tax_amount_cents) : 0,
            creditCents: sign > 0 ? line.tax_amount_cents : 0,
            vatCode: vatCodeForRate(settings, line.tax_rate_bp),
            vatRate: String(line.tax_rate_bp),
            branchId: settings.dimensions.branchAsCostCenter ? invoice.branch_id : null,
            status,
          }),
        );
      }
    }

    if (status === "paid" && invoice.paid_at) {
      const paidDate = amsterdamYmd(new Date(invoice.paid_at));
      const paidAmount = Math.max(invoice.amount_paid_cents || invoice.total_cents, 0);
      rows.push(
        buildRow({
          settings,
          date: paidDate,
          journal: settings.paymentJournalCode,
          invoiceNo: invoice.invoice_no,
          relationCode,
          relationName,
          rowType: "betaling debet",
          account: settings.accounts.paymentProvider || settings.accounts.bank,
          description: "Ontvangen betaling",
          debitCents: paidAmount,
          creditCents: 0,
          vatCode: "",
          vatRate: "",
          branchId: settings.dimensions.branchAsCostCenter ? invoice.branch_id : null,
          status,
        }),
      );
      rows.push(
        buildRow({
          settings,
          date: paidDate,
          journal: settings.paymentJournalCode,
          invoiceNo: invoice.invoice_no,
          relationCode,
          relationName,
          rowType: "betaling credit",
          account: settings.accounts.debtors,
          description: "Afboeken debiteur",
          debitCents: 0,
          creditCents: paidAmount,
          vatCode: "",
          vatRate: "",
          branchId: settings.dimensions.branchAsCostCenter ? invoice.branch_id : null,
          status,
        }),
      );
    }
  }

  return csvResponse(
    buildCsv(header, rows),
    accountingExportFilename(settings, from, to),
  );
}

function groupByInvoice(lines: LineRow[]): Map<string, LineRow[]> {
  const map = new Map<string, LineRow[]>();
  for (const line of lines) {
    const list = map.get(line.invoice_id) ?? [];
    list.push(line);
    map.set(line.invoice_id, list);
  }
  return map;
}

function buildRow(input: {
  settings: Awaited<ReturnType<typeof loadAccountingIntegrationSettings>>;
  date: string;
  journal: string;
  invoiceNo: number;
  relationCode: string;
  relationName: string;
  rowType: string;
  account: string;
  description: string;
  debitCents: number;
  creditCents: number;
  vatCode: string;
  vatRate: string;
  branchId: string | null;
  status: InvoiceStatus;
}): string[] {
  return [
    input.settings.administrationName || input.settings.administrationId || "",
    input.settings.provider,
    input.settings.exportFormat,
    input.date,
    input.journal,
    `#${String(input.invoiceNo).padStart(4, "0")}`,
    input.relationCode,
    input.relationName,
    input.rowType,
    input.account,
    input.description,
    input.debitCents ? eurosNl(input.debitCents) : "",
    input.creditCents ? eurosNl(input.creditCents) : "",
    input.vatCode,
    input.vatRate,
    input.branchId ?? "",
    input.status,
  ];
}
