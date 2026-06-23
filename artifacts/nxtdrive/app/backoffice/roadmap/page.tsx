import { Lightbulb, MoveRight, Vote } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { loadRoadmapCenter, PRODUCT_OPS_ROLES } from "@/lib/product-ops";
import {
  createRoadmapIdea,
  moveRoadmapItem,
  registerRoadmapInterest,
} from "./actions";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  ["now", "Nu in ontwikkeling"],
  ["next", "In planning"],
  ["later", "Later"],
  ["ideas", "Ideeen"],
  ["launched", "Gelanceerd"],
  ["not_planned", "Niet gepland"],
] as const;

const STATUS_OPTIONS = [
  ["idea", "Idee"],
  ["research", "Onderzoek"],
  ["design", "Design"],
  ["development", "Ontwikkeling"],
  ["beta", "Beta"],
  ["released", "Released"],
  ["not_planned", "Niet gepland"],
] as const;

export default async function RoadmapPage() {
  const { user, tenant } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  const isPlatformAdmin = user.profile?.is_platform_admin === true;
  const { items } = await loadRoadmapCenter(tenant.id);
  const interested = items.filter((item) => item.ownInterest).length;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Roadmap & ideeen"
        title="Wat wordt er ontwikkeld"
        description="Bekijk wat nu gebouwd wordt, wat in planning staat en welke ideeen zijn ingediend. Geef als tenant aan waar je interesse of urgentie zit."
      />

      <AdminMetricStrip
        items={[
          { label: "Items", value: items.length, hint: "Publieke roadmap" },
          {
            label: "Jullie interesse",
            value: interested,
            hint: "Door deze tenant gemarkeerd",
          },
          {
            label: "In ontwikkeling",
            value: items.filter((item) => item.category === "now").length,
            hint: "Nu actief",
          },
          {
            label: "Ideeen",
            value: items.filter((item) => item.category === "ideas").length,
            hint: "Nog niet gepland",
          },
        ]}
      />

      {isPlatformAdmin ? (
        <AdminPanel
          title="Nieuw roadmapidee"
          description="Platform admin kan publieke ideeen toevoegen."
        >
          <form
            action={createRoadmapIdea}
            className="grid gap-3 lg:grid-cols-[1fr_180px_auto]"
          >
            <div className="space-y-1.5">
              <Label htmlFor="roadmap-title">Titel</Label>
              <Input
                id="roadmap-title"
                name="title"
                placeholder="Bijv. nieuwe rapportage export"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="roadmap-surface">Onderdeel</Label>
              <Input
                id="roadmap-surface"
                name="surface"
                placeholder="planning"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Toevoegen
              </Button>
            </div>
            <div className="space-y-1.5 lg:col-span-3">
              <Label htmlFor="roadmap-description">Omschrijving</Label>
              <Textarea
                id="roadmap-description"
                name="description"
                placeholder="Waarom is dit waardevol?"
              />
            </div>
          </form>
        </AdminPanel>
      ) : null}

      <AdminGrid columns="3" className="items-start">
        {CATEGORIES.map(([category, label]) => {
          const categoryItems = items.filter(
            (item) => item.category === category,
          );
          return (
            <AdminPanel
              key={category}
              title={label}
              description={`${categoryItems.length} item${categoryItems.length === 1 ? "" : "s"}`}
              contentClassName="space-y-3"
            >
              {categoryItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-[var(--surface-2)] p-6 text-center">
                  <Lightbulb
                    className="mx-auto h-7 w-7 text-primary"
                    aria-hidden
                  />
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    Nog leeg
                  </p>
                </div>
              ) : (
                categoryItems.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-border bg-[var(--surface-2)] p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-primary/10 p-2 text-primary">
                        <Lightbulb className="h-4 w-4" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-black text-foreground">
                            {item.title}
                          </h2>
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                            {item.surface}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {item.description ||
                            "Nog geen uitgebreide omschrijving."}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{item.status}</span>
                          <span>Priority: {item.priority}</span>
                          <span>{item.interestCount} tenant-interesse</span>
                          {item.ownInterest ? (
                            <span className="rounded-full bg-success/10 px-2 py-0.5 font-bold text-success">
                              Jullie: {item.ownInterest.interest_level}
                            </span>
                          ) : null}
                        </div>

                        <form
                          action={registerRoadmapInterest}
                          className="mt-3 grid gap-2 md:grid-cols-[150px_1fr_auto]"
                        >
                          <input
                            type="hidden"
                            name="roadmap_item_id"
                            value={item.id}
                          />
                          <Select
                            name="interest_level"
                            defaultValue={
                              item.ownInterest?.interest_level ?? "interested"
                            }
                          >
                            <option value="interested">Interessant</option>
                            <option value="important">Belangrijk</option>
                            <option value="critical">Kritiek</option>
                          </Select>
                          <Input
                            name="note"
                            defaultValue={item.ownInterest?.note ?? ""}
                            placeholder="Waarom belangrijk?"
                          />
                          <Button type="submit" variant="outline">
                            <Vote className="mr-2 h-4 w-4" aria-hidden />
                            Stem
                          </Button>
                        </form>

                        {isPlatformAdmin ? (
                          <form
                            action={moveRoadmapItem}
                            className="mt-3 grid gap-2 border-t border-border pt-3 md:grid-cols-[1fr_1fr_auto]"
                          >
                            <input
                              type="hidden"
                              name="roadmap_item_id"
                              value={item.id}
                            />
                            <Select
                              name="category"
                              defaultValue={item.category}
                            >
                              {CATEGORIES.map(([value, optionLabel]) => (
                                <option key={value} value={value}>
                                  {optionLabel}
                                </option>
                              ))}
                            </Select>
                            <Select name="status" defaultValue={item.status}>
                              {STATUS_OPTIONS.map(([value, optionLabel]) => (
                                <option key={value} value={value}>
                                  {optionLabel}
                                </option>
                              ))}
                            </Select>
                            <Button type="submit" size="sm">
                              <MoveRight className="mr-2 h-4 w-4" aria-hidden />
                              Verplaats
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </AdminPanel>
          );
        })}
      </AdminGrid>
    </AdminPage>
  );
}
