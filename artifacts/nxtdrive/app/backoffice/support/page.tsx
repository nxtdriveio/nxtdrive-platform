import { LifeBuoy, MessageCircle, Send, ShieldCheck } from "lucide-react";
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
import { loadSupportCenter, PRODUCT_OPS_ROLES } from "@/lib/product-ops";
import {
  addSupportTicketComment,
  createSupportTicket,
  updateSupportTicketStatus,
} from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  triage: "Triage",
  waiting_on_tenant: "Wacht op tenant",
  waiting_on_nxtdrive: "Wacht op NXTDRIVE",
  resolved: "Opgelost",
  closed: "Gesloten",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Laag",
  normal: "Normaal",
  high: "Hoog",
  urgent: "Urgent",
};

export default async function SupportPage() {
  const { tenant } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  const { tickets } = await loadSupportCenter(tenant.id);
  const open = tickets.filter(
    (ticket) => !["resolved", "closed"].includes(ticket.status),
  );
  const urgent = tickets.filter((ticket) => ticket.priority === "urgent");
  const waiting = tickets.filter(
    (ticket) => ticket.status === "waiting_on_tenant",
  );

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="NXTDRIVE support"
        title="Support tickets"
        description="Leg vragen, bugs, dataverzoeken en onboardingpunten vast met eigenaar, prioriteit, status en zichtbare opvolging."
      />

      <AdminMetricStrip
        items={[
          {
            label: "Open tickets",
            value: open.length,
            hint: "Nog in behandeling",
          },
          {
            label: "Urgent",
            value: urgent.length,
            hint: "Direct aandacht nodig",
          },
          {
            label: "Wacht op jullie",
            value: waiting.length,
            hint: "Actie bij tenant",
          },
          {
            label: "Totaal",
            value: tickets.length,
            hint: "Alle tickets in deze tenant",
          },
        ]}
      />

      <AdminGrid columns="3" className="items-start">
        <AdminPanel
          title="Nieuw ticket"
          description="Maak een duidelijk supportverzoek aan."
          className="xl:col-span-1"
        >
          <form action={createSupportTicket} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="support-title">Onderwerp</Label>
              <Input
                id="support-title"
                name="title"
                placeholder="Bijv. leerling kan niet boeken"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="support-category">Categorie</Label>
                <Select
                  id="support-category"
                  name="category"
                  defaultValue="question"
                >
                  <option value="question">Vraag</option>
                  <option value="bug">Bug</option>
                  <option value="billing">Facturatie</option>
                  <option value="feature">Feature</option>
                  <option value="data">Data</option>
                  <option value="onboarding">Onboarding</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="support-priority">Prioriteit</Label>
                <Select
                  id="support-priority"
                  name="priority"
                  defaultValue="normal"
                >
                  <option value="low">Laag</option>
                  <option value="normal">Normaal</option>
                  <option value="high">Hoog</option>
                  <option value="urgent">Urgent</option>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-description">Beschrijving</Label>
              <Textarea
                id="support-description"
                name="description"
                placeholder="Wat gebeurt er, bij wie, en wat verwacht je?"
                className="min-h-32"
              />
            </div>
            <Button type="submit" className="w-full">
              <Send className="mr-2 h-4 w-4" aria-hidden />
              Ticket aanmaken
            </Button>
          </form>
        </AdminPanel>

        <AdminPanel
          title="Tickets"
          description="Status en laatste context"
          className="xl:col-span-2"
          contentClassName="space-y-3"
        >
          {tickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-[var(--surface-2)] p-8 text-center">
              <LifeBuoy className="mx-auto h-8 w-8 text-primary" aria-hidden />
              <p className="mt-3 font-semibold text-foreground">
                Nog geen tickets
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Zodra er supportvragen zijn, verschijnen ze hier met status en
                opvolging.
              </p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <article
                key={ticket.id}
                className="rounded-2xl border border-border bg-[var(--surface-2)] p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                        {STATUS_LABELS[ticket.status] ?? ticket.status}
                      </span>
                      <span className="rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground">
                        {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                      </span>
                    </div>
                    <h2 className="mt-2 text-base font-black text-foreground">
                      {ticket.title}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {ticket.description ||
                        "Geen extra beschrijving meegegeven."}
                    </p>
                  </div>
                  <form
                    action={updateSupportTicketStatus}
                    className="flex shrink-0 gap-2"
                  >
                    <input type="hidden" name="ticket_id" value={ticket.id} />
                    <Select
                      name="status"
                      defaultValue={ticket.status}
                      className="h-10 min-w-44"
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" variant="outline" size="sm">
                      Bewaar
                    </Button>
                  </form>
                </div>

                <div className="mt-3 space-y-2">
                  {(ticket.comments ?? []).slice(-3).map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                        {new Intl.DateTimeFormat("nl-NL", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(comment.created_at))}
                      </div>
                      {comment.body}
                    </div>
                  ))}
                </div>

                <form
                  action={addSupportTicketComment}
                  className="mt-3 flex flex-col gap-2 sm:flex-row"
                >
                  <input type="hidden" name="ticket_id" value={ticket.id} />
                  <Input
                    name="body"
                    placeholder="Korte reactie of update..."
                    className="min-w-0 flex-1"
                  />
                  <Button type="submit" variant="outline">
                    Reageer
                  </Button>
                </form>
              </article>
            ))
          )}
        </AdminPanel>
      </AdminGrid>

      <AdminPanel
        title="Support-afspraken"
        description="Formele flow voor betrouwbare opvolging"
      >
        <div className="grid gap-3 md:grid-cols-3">
          {[
            [
              "Signaal",
              "Maak ieder incident of verzoek traceerbaar als ticket.",
            ],
            [
              "Eigenaar",
              "NXTDRIVE of tenant kan status en context zichtbaar houden.",
            ],
            [
              "Audit",
              "Reacties en statuswijzigingen blijven gekoppeld aan de tenant.",
            ],
          ].map(([title, body]) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-[var(--surface-2)] p-4"
            >
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
              <p className="mt-2 font-bold text-foreground">{title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
      </AdminPanel>
    </AdminPage>
  );
}
