import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildSkillTree, type SkillTaxonomyNode } from "@workspace/leskaart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { loadTheoryModulesWithSkills } from "@/lib/theory/data";
import {
  TheoryModuleSkillsEditor,
  type SkillPickerGroup,
} from "@/components/backoffice/TheoryModuleSkillsEditor";
import {
  createTheoryModule,
  toggleTheoryModuleActive,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function TheoriePage() {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const supabase = await createServerSupabaseClient();

  const [modules, taxRes] = await Promise.all([
    loadTheoryModulesWithSkills(supabase, tenant.id),
    supabase
      .from("skill_taxonomy")
      .select(
        "id, tenant_id, parent_id, level, code, label, sort_order, is_critical, theory_link, active, version, created_at, updated_at",
      )
      .eq("tenant_id", tenant.id)
      .eq("active", true),
  ]);
  if (taxRes.error) {
    throw new Error(
      `theorie: load taxonomy failed (tenant=${tenant.id}): ${taxRes.error.message}`,
    );
  }

  const tree = buildSkillTree((taxRes.data ?? []) as SkillTaxonomyNode[]);
  const groups: SkillPickerGroup[] = tree
    .filter((c) => c.level === 1)
    .map((cat) => ({
      id: cat.id,
      label: cat.label,
      subgroups: cat.children.map((sub) => ({
        id: sub.id,
        label: sub.label,
        leaves: sub.children
          .filter((l) => l.level === 3)
          .map((l) => ({ id: l.id, label: l.label })),
      })),
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Theoriemodules
        </h1>
        <p className="text-sm text-muted-foreground">
          Beheer de theoriemodules en koppel ze aan de vaardigheden van de
          leskaart. Gekoppelde modules sturen het huiswerkadvies aan.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {modules.length === 0 ? (
            <Card>
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nog geen theoriemodules — maak er rechts één aan.
              </div>
            </Card>
          ) : (
            modules.map((m) => (
              <Card key={m.id}>
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {m.title}
                        </span>
                        {m.code ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {m.code}
                          </span>
                        ) : null}
                        {m.active ? (
                          <Badge variant="success">Actief</Badge>
                        ) : (
                          <Badge variant="warning">Inactief</Badge>
                        )}
                      </div>
                      {m.description ? (
                        <p className="text-sm text-muted-foreground">
                          {m.description}
                        </p>
                      ) : null}
                    </div>
                    <form action={toggleTheoryModuleActive}>
                      <input type="hidden" name="module_id" value={m.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={String(m.active)}
                      />
                      <Button type="submit" variant="ghost" size="sm">
                        {m.active ? "Deactiveren" : "Activeren"}
                      </Button>
                    </form>
                  </div>

                  <TheoryModuleSkillsEditor
                    moduleId={m.id}
                    groups={groups}
                    initialSkillIds={m.skillIds}
                  />
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Nieuwe module</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createTheoryModule} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-title">Titel</Label>
                <Input
                  id="t-title"
                  name="title"
                  required
                  placeholder="bv. Voorrang &amp; voorrangsregels"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-code">Code (optioneel)</Label>
                <Input id="t-code" name="code" placeholder="bv. voorrang" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-description">Omschrijving (optioneel)</Label>
                <Textarea
                  id="t-description"
                  name="description"
                  rows={3}
                  maxLength={1000}
                  placeholder="Korte toelichting voor de leerling"
                />
              </div>
              <Button type="submit" size="sm" className="w-full">
                Module aanmaken
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
