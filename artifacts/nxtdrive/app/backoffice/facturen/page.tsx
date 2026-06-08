import Link from "next/link";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BranchFilterChips,
  BranchScopeSummary,
  BranchScopedEmptyState,
} from "@/components/backoffice/branch-scope-ui";
import { listBranches } from "@/lib/branches/service";
import {
  canManageInvoices,
  requireInvoiceBackofficeReadAccess,
  selectedInvoiceBranchIds,
} from "@/lib/invoices/access";
import {
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_VARIANT,
  INVOICE_STATUSES,
  INVOICE_STATUS_LABEL,
  displayStatus,
  formatEuros,
  installmentLabel,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/invoices/types";
import type { Student } from "@/lib/students/types";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function isValidStatus(s: string): s is InvoiceStatus {
  return (INVOICE_STATUSES as readonly string[]).includes(s);
}

export default async function FacturenListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; branch?: string }>;
}) {
  const sp = await searchParams;
  const access = await requireInvoiceBackofficeReadAccess();
  const { context, service, branchScope } = access;
  const tenant = context.organization;
  const statusFilter =
    sp.status && isValidStatus(sp.status) ? sp.status : null;

  const allBranches = await listBranches(service, tenant.id, { activeOnly: true });
  const branches =
    branchScope.scope_type === "branches"
      ? allBranches.filter((b) => branchScope.branch_ids.includes(b.id))
      : allBranches;
  const selectedBranchId =
    sp.branch && branches.some((b) => b.id === sp.branch) ? sp.branch : null;
  const selectedBranchName = branches.find((b) => b.id === selectedBranchId)?.name;
  const branchFilterIds = selectedInvoiceBranchIds(
    branchScope,
    selectedBranchId,
  );
  const canManage = canManageInvoices(access);

  let invoices: Invoice[] = [];
  if (!branchFilterIds || branchFilterIds.length > 0) {
    let query = service
      .from("invoices")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (statusFilter) query = query.eq("status", statusFilter);
    if (branchFilterIds) query = query.in("branch_id", branchFilterIds);
    const { data: invoicesRaw } = await query;
    invoices = (invoicesRaw ?? []) as Invoice[];
  }

  // Fetch student names for the visible invoices only.
  const studentIds = Array.from(new Set(invoices.map((i) => i.student_id)));
  const studentsById = new Map<string, Pick<Student, "id" | "full_name">>();
  if (studentIds.length > 0) {
    const { data: students } = await service
      .from("students")
      .select("id, full_name")
      .eq("tenant_id", tenant.id)
      .in("id", studentIds);
    for (const s of (students ?? []) as Pick<Student, "id" | "full_name">[]) {
      studentsById.set(s.id, s);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Facturen
          </h1>
          <p className="text-sm text-muted-foreground">
            Beheer concepten, openstaande en betaalde facturen binnen je
            toegestane vestigingen.
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/backoffice/facturen/termijn"
              className={buttonVariants({ size: "sm", variant: "secondary" })}
            >
              Termijnfactuur
            </Link>
            <Link
              href="/backoffice/facturen/nieuw"
              className={buttonVariants({ size: "sm" })}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              Nieuwe factuur
            </Link>
          </div>
        ) : null}
      </div>

      <BranchScopeSummary
        scope={branchScope}
        selectedBranchName={selectedBranchName}
        branchCount={branches.length}
        sharedRowsLabel={null}
      />
      <BranchFilterChips
        branches={branches}
        selectedBranchId={selectedBranchId}
        allHref={filterHref({ status: statusFilter })}
        hrefForBranch={(branchId) => filterHref({ status: statusFilter, branchId })}
      />

      <div className="flex flex-wrap gap-2 text-xs">
        <FilterChip
          href={filterHref({ branchId: selectedBranchId })}
          active={statusFilter === null}
        >
          Alle
        </FilterChip>
        {INVOICE_STATUSES.map((s) => (
          <FilterChip
            key={s}
            href={filterHref({ status: s, branchId: selectedBranchId })}
            active={statusFilter === s}
          >
            {INVOICE_STATUS_LABEL[s]}
          </FilterChip>
        ))}
      </div>

      {invoices.length === 0 ? (
        <BranchScopedEmptyState
          title={statusFilter || selectedBranchId ? "Geen facturen binnen deze filter" : "Nog geen facturen"}
          description={
            statusFilter || selectedBranchId
              ? "Er zijn geen facturen gevonden voor deze combinatie van status en vestiging. Kies een ruimere filter om meer resultaten te zien."
              : "Maak een eerste factuur aan zodra je leerlingen of pakketten wilt factureren."
          }
          action={
            canManage && !statusFilter && !selectedBranchId ? (
              <Link href="/backoffice/facturen/nieuw" className={buttonVariants({ size: "sm" })}>
                Nieuwe factuur
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nr.</th>
                <th className="px-4 py-3 font-medium">Leerling</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Vervaldatum</th>
                <th className="px-4 py-3 font-medium text-right">Totaal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((inv) => {
                const display = displayStatus(inv);
                const student = studentsById.get(inv.student_id);
                return (
                  <tr key={inv.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/backoffice/facturen/${inv.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        #{String(inv.invoice_no).padStart(4, "0")}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {inv.kind === "credit_note" ? (
                          <Badge variant="warning">Credit</Badge>
                        ) : null}
                        {installmentLabel(inv) ? (
                          <Badge variant="info">{installmentLabel(inv)}</Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {student?.full_name ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={DISPLAY_STATUS_VARIANT[display]}>
                        {DISPLAY_STATUS_LABEL[display]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {inv.due_date
                        ? dateFmt.format(new Date(inv.due_date))
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {formatEuros(inv.total_cents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function filterHref({
  status,
  branchId,
}: {
  status?: InvoiceStatus | null;
  branchId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (branchId) params.set("branch", branchId);
  const qs = params.toString();
  return qs ? `/backoffice/facturen?${qs}` : "/backoffice/facturen";
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground"
          : "rounded-full border border-border px-3 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      }
    >
      {children}
    </Link>
  );
}
