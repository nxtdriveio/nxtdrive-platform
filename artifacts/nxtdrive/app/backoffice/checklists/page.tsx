import {
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  ShieldAlert,
} from "lucide-react";
import {
  AdminGrid,
  AdminMetricStrip,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/backoffice/admin-primitives";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { loadChecklistCenter, PRODUCT_OPS_ROLES } from "@/lib/product-ops";
import { updateChecklistItemStatus } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  not_started: "Niet gestart",
  in_progress: "Bezig",
  done: "Afgerond",
  blocked: "Geblokkeerd",
  not_applicable: "Niet van toepassing",
};

function progress(items: Array<{ status?: { status: string } | null }>) {
  if (items.length === 0) return 0;
  const done = items.filter(
    (item) =>
      item.status?.status === "done" ||
      item.status?.status === "not_applicable",
  ).length;
  return Math.round((done / items.length) * 100);
}

export default async function ChecklistsPage() {
  const { tenant } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  const checklists = await loadChecklistCenter(tenant.id);
  const allItems = checklists.flatMap((checklist) => checklist.items);
  const done = allItems.filter((item) => item.status?.status === "done").length;
  const blocked = allItems.filter(
    (item) => item.status?.status === "blocked",
  ).length;
  const active = allItems.filter(
    (item) => item.status?.status === "in_progress",
  ).length;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Productiechecklists"
        title="Onboarding & monitoring"
        description="Formele checks voor livegang, beheer, continuiteit en operationele kwaliteit. Dit is klantgericht: geen technische takenlijst, maar duidelijke eigenaar-acties."
      />

      <AdminMetricStrip
        items={[
          {
            label: "Checks",
            value: allItems.length,
            hint: "Actieve checklist-items",
          },
          { label: "Afgerond", value: done, hint: "Door tenant gemarkeerd" },
          { label: "Bezig", value: active, hint: "In uitvoering" },
          { label: "Geblokkeerd", value: blocked, hint: "Vraagt aandacht" },
        ]}
      />

      <AdminGrid columns="2" className="items-start">
        {checklists.map((checklist) => {
          const pct = progress(checklist.items);
          return (
            <AdminPanel
              key={checklist.id}
              title={checklist.title}
              description={checklist.description}
              contentClassName="space-y-3"
            >
              <div className="rounded-xl border border-border bg-[var(--surface-2)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-foreground">
                      {pct}% compleet
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {checklist.checklist_type === "onboarding"
                        ? "Klant gereed voor productie"
                        : "Operationele bewaking"}
                    </p>
                  </div>
                  <ClipboardCheck
                    className="h-7 w-7 text-primary"
                    aria-hidden
                  />
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {checklist.items.map((item) => {
                const current = item.status?.status ?? "not_started";
                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-border bg-[var(--surface-2)] p-4"
                  >
                    <div className="flex gap-3">
                      {current === "done" ? (
                        <CheckCircle2
                          className="mt-1 h-5 w-5 shrink-0 text-success"
                          aria-hidden
                        />
                      ) : current === "blocked" ? (
                        <ShieldAlert
                          className="mt-1 h-5 w-5 shrink-0 text-warning"
                          aria-hidden
                        />
                      ) : (
                        <CircleDashed
                          className="mt-1 h-5 w-5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-bold text-foreground">
                            {item.title}
                          </h2>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                            {STATUS_LABELS[current]}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {item.description}
                        </p>
                        {item.evidence_hint ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Bewijs: {item.evidence_hint}
                          </p>
                        ) : null}

                        <form
                          action={updateChecklistItemStatus}
                          className="mt-3 grid gap-2 md:grid-cols-[150px_1fr_1fr_auto]"
                        >
                          <input
                            type="hidden"
                            name="checklist_item_id"
                            value={item.id}
                          />
                          <div className="space-y-1.5">
                            <Label className="sr-only">Status</Label>
                            <Select name="status" defaultValue={current}>
                              {Object.entries(STATUS_LABELS).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </Select>
                          </div>
                          <Input
                            name="note"
                            defaultValue={item.status?.note ?? ""}
                            placeholder="Interne notitie"
                          />
                          <Input
                            name="evidence_url"
                            defaultValue={item.status?.evidence_url ?? ""}
                            placeholder="Evidence-link"
                          />
                          <Button type="submit" variant="outline">
                            Opslaan
                          </Button>
                        </form>
                      </div>
                    </div>
                  </article>
                );
              })}
            </AdminPanel>
          );
        })}
      </AdminGrid>
    </AdminPage>
  );
}
