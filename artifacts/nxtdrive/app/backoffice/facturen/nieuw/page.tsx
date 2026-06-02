import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
import { formatTegoed, type Student } from "@/lib/students/types";
import { formatEuros, type Package } from "@/lib/packages/types";
import { createInvoice } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ student_id?: string }>;
}) {
  const sp = await searchParams;
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const supabase = await createServerSupabaseClient();

  const [studentsRes, packagesRes] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("full_name", { ascending: true })
      .limit(500),
    supabase
      .from("packages")
      .select("id, name, credits_total, price_cents, active")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("credits_total", { ascending: true }),
  ]);
  const students = (studentsRes.data ?? []) as Pick<
    Student,
    "id" | "full_name"
  >[];
  const packages = (packagesRes.data ?? []) as Pick<
    Package,
    "id" | "name" | "credits_total" | "price_cents" | "active"
  >[];

  const preselectedStudent = sp.student_id ?? "";

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
          Nieuwe factuur
        </h1>
        <p className="text-sm text-muted-foreground">
          Kies een leerling en optioneel een pakket of vrije regel. De factuur
          wordt eerst als concept aangemaakt.
        </p>
      </div>

      {students.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Er zijn nog geen leerlingen. Voeg er eerst een toe via{" "}
            <Link href="/backoffice/leerlingen" className="text-primary hover:underline">
              Leerlingen
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Factuurgegevens</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createInvoice} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="student_id">Leerling</Label>
                <Select
                  id="student_id"
                  name="student_id"
                  required
                  defaultValue={preselectedStudent}
                >
                  <option value="" disabled>
                    Kies een leerling…
                  </option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="due_date">Vervaldatum (optioneel)</Label>
                  <Input
                    id="due_date"
                    name="due_date"
                    type="date"
                  />
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

              <div className="rounded-md border border-border bg-muted/30 p-4 space-y-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Eerste regel (optioneel — kun je later ook toevoegen)
                </p>

                {packages.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="package_id">Pakket</Label>
                    <Select
                      id="package_id"
                      name="package_id"
                      defaultValue=""
                    >
                      <option value="">Geen pakket — vrije regel hieronder</option>
                      {packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatTegoed(p.credits_total)} ·{" "}
                          {formatEuros(p.price_cents)}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Bij een pakket wordt de naam en prijs automatisch als regel
                      ingevuld.
                    </p>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label htmlFor="line_description">Omschrijving</Label>
                    <Input
                      id="line_description"
                      name="line_description"
                      maxLength={500}
                      placeholder="bv. Tussentijdse toets"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="line_quantity">Aantal</Label>
                    <Input
                      id="line_quantity"
                      name="line_quantity"
                      defaultValue="1"
                      placeholder="1"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="line_unit_price_euros">Bedrag per eenheid (€)</Label>
                  <Input
                    id="line_unit_price_euros"
                    name="line_unit_price_euros"
                    placeholder="bv. 95,00"
                  />
                </div>
              </div>

              <Button type="submit">Factuur aanmaken (concept)</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
