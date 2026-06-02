import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatEuros, type Package } from "@/lib/packages/types";
import { formatTegoed } from "@/lib/students/types";
import { createPackage, togglePackageActive } from "./actions";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const supabase = await createServerSupabaseClient();
  const { data: packagesRaw } = await supabase
    .from("packages")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("active", { ascending: false })
    .order("credits_total", { ascending: true });
  const packages = (packagesRaw ?? []) as Package[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Pakketten
        </h1>
        <p className="text-sm text-muted-foreground">
          Definieer uren-pakketten die je aan studenten kunt toekennen.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            {packages.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nog geen pakketten — maak er rechts één aan.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Naam</th>
                    <th className="px-4 py-3 font-medium">Uren</th>
                    <th className="px-4 py-3 font-medium">Prijs</th>
                    <th className="px-4 py-3 font-medium">Geldigheid</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {packages.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {p.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatTegoed(p.credits_total)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatEuros(p.price_cents)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.valid_days ? `${p.valid_days} dagen` : "Onbeperkt"}
                      </td>
                      <td className="px-4 py-3">
                        {p.active ? (
                          <Badge variant="success">Actief</Badge>
                        ) : (
                          <Badge variant="warning">Inactief</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <form action={togglePackageActive}>
                          <input
                            type="hidden"
                            name="package_id"
                            value={p.id}
                          />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                          >
                            {p.active ? "Deactiveren" : "Activeren"}
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Nieuw pakket</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createPackage} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Naam</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder="bv. Standaardpakket"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="credits_total">Uren</Label>
                  <Input
                    id="credits_total"
                    name="credits_total"
                    type="number"
                    step="0.5"
                    min={0.5}
                    required
                    placeholder="30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="price_euros">Prijs (€)</Label>
                  <Input
                    id="price_euros"
                    name="price_euros"
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    placeholder="1800.00"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="valid_days">Geldig (dagen, leeg = onbeperkt)</Label>
                <Input
                  id="valid_days"
                  name="valid_days"
                  type="number"
                  min={1}
                  placeholder="365"
                />
              </div>
              <Button type="submit" size="sm" className="w-full">
                Pakket aanmaken
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
