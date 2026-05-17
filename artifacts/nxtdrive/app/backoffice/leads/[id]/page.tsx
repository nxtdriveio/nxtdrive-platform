import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  LEAD_EVENT_LABEL,
  LEAD_SOURCE_LABEL,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_VARIANT,
  type Lead,
  type LeadEvent,
} from "@/lib/leads/types";
import { addNote, updateStatus } from "../actions";

export const dynamic = "force-dynamic";

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);

  const supabase = await createServerSupabaseClient();
  const { data: leadRaw } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!leadRaw) notFound();
  const lead = leadRaw as Lead;

  const { data: eventsRaw } = await supabase
    .from("lead_events")
    .select("id, lead_id, tenant_id, actor_user_id, event_type, payload, created_at")
    .eq("lead_id", id)
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const events = (eventsRaw ?? []) as LeadEvent[];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/backoffice/leads"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Terug naar leads
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {lead.full_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Binnengekomen op {dateTimeFmt.format(new Date(lead.created_at))} via{" "}
            {LEAD_SOURCE_LABEL[lead.source]}
          </p>
        </div>
        <Badge variant={LEAD_STATUS_VARIANT[lead.status]}>
          {LEAD_STATUS_LABEL[lead.status]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Contactgegevens</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <Field label="E-mail" value={lead.email} />
                <Field label="Telefoon" value={lead.phone} />
                <Field label="Postcode" value={lead.postcode} />
                <Field label="Bron" value={LEAD_SOURCE_LABEL[lead.source]} />
              </dl>
              {lead.message ? (
                <div className="mt-5">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Bericht
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
                    {lead.message}
                  </dd>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notitie toevoegen</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addNote} className="space-y-3">
                <input type="hidden" name="lead_id" value={lead.id} />
                <Textarea
                  name="note"
                  required
                  maxLength={2000}
                  placeholder="Wat is er besproken? Volgende stap?"
                />
                <Button type="submit" size="sm">
                  Notitie opslaan
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historie</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nog geen activiteit.
                </p>
              ) : (
                <ol className="space-y-3">
                  {events.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm"
                    >
                      <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">
                            {LEAD_EVENT_LABEL[ev.event_type]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {dateTimeFmt.format(new Date(ev.created_at))}
                          </span>
                        </div>
                        <EventDetail event={ev} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Status bijwerken</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateStatus} className="space-y-3">
                <input type="hidden" name="lead_id" value={lead.id} />
                <Select name="status" defaultValue={lead.status}>
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
                <Button type="submit" size="sm" className="w-full">
                  Status opslaan
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

function EventDetail({ event }: { event: LeadEvent }) {
  const p = event.payload ?? {};
  if (event.event_type === "status_changed") {
    const from = String((p as Record<string, unknown>).from ?? "");
    const to = String((p as Record<string, unknown>).to ?? "");
    return (
      <p className="text-xs text-muted-foreground">
        Van <span className="text-foreground">{LEAD_STATUS_LABEL[from as keyof typeof LEAD_STATUS_LABEL] ?? from}</span>{" "}
        naar{" "}
        <span className="text-foreground">{LEAD_STATUS_LABEL[to as keyof typeof LEAD_STATUS_LABEL] ?? to}</span>
      </p>
    );
  }
  if (event.event_type === "note") {
    const note = String((p as Record<string, unknown>).note ?? "");
    return (
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{note}</p>
    );
  }
  if (event.event_type === "created") {
    const source = String((p as Record<string, unknown>).source ?? "");
    return (
      <p className="text-xs text-muted-foreground">
        Aangemaakt via {LEAD_SOURCE_LABEL[source as keyof typeof LEAD_SOURCE_LABEL] ?? source}
      </p>
    );
  }
  return null;
}
