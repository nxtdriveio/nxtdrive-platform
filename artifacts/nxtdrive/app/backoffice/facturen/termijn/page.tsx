import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatEuros, type Package } from "@/lib/packages/types";
import {
  requireInvoiceBackofficeManageAccess,
  type InvoiceStudentTarget,
} from "@/lib/invoices/access";
import { createInstallmentPlan } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewInstallmentPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ student_id?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { context, service, branchScope } = await requireInvoiceBackofficeManageAccess();
  const tenant = context.organization;

  let students: InvoiceStudentTarget[] = [];
  if (branchScope.scope_type === "all" || branchScope.branch_ids.length > 0) {
    let studentsQuery = service
      .from("students")
      .select("id, full_name, branch_id")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("full_name", { ascending: true })
      .limit(500);
    if (branchScope.scope_type === "branches") {
      studentsQuery = studentsQuery.in("branch_id", branchScope.branch_ids);
    }
    const { data } = await studentsQuery;
    students = (data ?? []) as InvoiceStudentTarget[];
  }

  const { data: packagesRaw } = await service
    .from("packages")
    .select("id, name, credits_total, price_cents, active")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .order("credits_total", { ascending: true });
  const packages = (packagesRaw ?? []) as Pick<
    Package,
    "id" | "name" | "credits_total" | "price_cents" | "active"
  >[];

  const preselectedStudent = students.some((s) => s.id === sp.student_id)
    ? (sp.student_id ?? "")
    : "";
  const errorMsg =
    sp.error === "invalid"
      ? "Controleer de ingevulde gegevens (totaalbedrag en aantal termijnen)."
      : sp.error
        ? decodeURIComponent(sp.error)
        : null;

  return (
    <div className="space-y-6">
      <Link
        href="/backoffice/facturen"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Terug naar facturen
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Termijnfactuur
        </h1>
        <p className="text-sm text-muted-foreground">
          Verdeel een totaalbedrag over meerdere facturen binnen de toegestane
          vestiging van de gekozen leerling.
        </p>
      </div>

      {errorMsg ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {errorMsg}
        </p>
      ) : null}

      {students.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Er zijn geen actieve leerlingen binnen je facturatie-scope. Voeg een
            leerling toe of controleer je vestigingstoegang.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Termijnschema</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createInstallmentPlan} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="student_id">Leerling</Label>
                <Select
                  id="student_id"
                  name="student_id"
                  required
                  defaultValue={preselectedStudent}
                >
                  <option value="" disabled>
                    Kies een leerling...
                  </option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </Select>
              </div>

              {packages.length > 0 ? (
                <div className="space-y-1.5">
                  <Label htmlFor="package_id">Pakket (optioneel)</Label>
                  <Select id="package_id" name="package_id" defaultValue="">
                    <option value="">Geen pakket - vrije omschrijving</option>
                    {packages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} - {formatEuros(p.price_cents)}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Het pakket wordt als verwijzing op elke termijnregel gezet.
                  </p>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="description">Omschrijving</Label>
                <Input
                  id="description"
                  name="description"
                  maxLength={500}
                  placeholder="bv. Rijpakket 30 lessen"
                />
                <p className="text-xs text-muted-foreground">
                  Verplicht als je geen pakket kiest. Wordt aangevuld met
                  &quot;Termijn X van N&quot; per regel.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="total_euros">Totaalbedrag (excl. btw, €)</Label>
                  <Input
                    id="total_euros"
                    name="total_euros"
                    required
                    placeholder="bv. 1500,00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="installment_count">Aantal termijnen</Label>
                  <Input
                    id="installment_count"
                    name="installment_count"
                    type="number"
                    min={2}
                    max={60}
                    defaultValue="3"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="first_due_date">
                    Eerste vervaldatum (optioneel)
                  </Label>
                  <Input
                    id="first_due_date"
                    name="first_due_date"
                    type="date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="interval_days">Interval (dagen)</Label>
                  <Input
                    id="interval_days"
                    name="interval_days"
                    type="number"
                    min={0}
                    max={365}
                    defaultValue="30"
                  />
                  <p className="text-xs text-muted-foreground">
                    Aantal dagen tussen opeenvolgende vervaldatums.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Interne notitie (optioneel)</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  maxLength={2000}
                  placeholder="Niet zichtbaar voor de leerling."
                />
              </div>

              <Button type="submit">Termijnfacturen aanmaken</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
