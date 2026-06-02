import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generateTrialLessonSuggestions } from "@/lib/trial-lessons/suggestions";
import type { TrialSuggestion } from "@/lib/trial-lessons/types";
import { chooseTrialLesson } from "../actions";

export const dynamic = "force-dynamic";

const slotFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function IntakeThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lead?: string; booked?: string; slot?: string }>;
}) {
  const { slug } = await params;
  const { lead: leadId, booked, slot } = await searchParams;
  const service = createServiceRoleClient();
  const { data: tenant } = await service
    .from("tenants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  // Verify the lead belongs to this tenant before doing anything lead-specific.
  let validLeadId: string | null = null;
  if (leadId) {
    const { data: leadRow } = await service
      .from("leads")
      .select("id")
      .eq("id", leadId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    validLeadId = leadRow?.id ?? null;
  }

  // Already-booked trial (provisional/confirmed) for this lead?
  let bookedTrial: { starts_at: string; duration_min: number } | null = null;
  if (validLeadId) {
    const { data: trial } = await service
      .from("trial_lessons")
      .select("starts_at, duration_min")
      .eq("lead_id", validLeadId)
      .eq("tenant_id", tenant.id)
      .in("status", ["provisional", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    bookedTrial = trial ?? null;
  }

  const suggestions: TrialSuggestion[] =
    validLeadId && !bookedTrial
      ? await generateTrialLessonSuggestions(service, validLeadId, 3)
      : [];

  // --- Confirmation state (just booked or already had one) -----------------
  if (bookedTrial || booked === "1") {
    const when = bookedTrial
      ? `${cap(slotFmt.format(new Date(bookedTrial.starts_at)))} om ${timeFmt.format(new Date(bookedTrial.starts_at))}`
      : null;
    return (
      <main className="bg-nxt-grid relative flex min-h-screen items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md p-8 text-center">
          <NxtdriveLogo className="mx-auto text-xl" />
          <h1 className="mt-6 text-2xl font-semibold text-foreground">
            Je proefles staat gepland
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {when ? (
              <>
                We hebben je voorkeur ontvangen voor{" "}
                <span className="font-medium text-foreground">{when}</span>.{" "}
              </>
            ) : null}
            {tenant.name} bevestigt je proefles zo snel mogelijk en neemt contact
            met je op.
          </p>
        </Card>
      </main>
    );
  }

  // --- No lead context: plain thank-you ------------------------------------
  if (!validLeadId || suggestions.length === 0) {
    return (
      <main className="bg-nxt-grid relative flex min-h-screen items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md p-8 text-center">
          <NxtdriveLogo className="mx-auto text-xl" />
          <h1 className="mt-6 text-2xl font-semibold text-foreground">
            Bedankt voor je aanvraag
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tenant.name} ontvangt je gegevens en neemt zo snel mogelijk contact
            met je op om je proefles in te plannen.
          </p>
        </Card>
      </main>
    );
  }

  // --- Suggestion picker ---------------------------------------------------
  return (
    <main className="bg-nxt-grid relative flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center">
          <NxtdriveLogo className="mx-auto text-xl" />
          <h1 className="mt-6 text-2xl font-semibold text-foreground">
            Bedankt voor je aanvraag
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Op basis van je voorkeuren hebben we alvast een paar momenten voor je
            proefles bij {tenant.name} gevonden. Kies wat jou het beste uitkomt —
            je keuze is een voorstel; de rijschool bevestigt het definitief.
          </p>
        </div>

        {slot === "unavailable" ? (
          <p className="mt-4 rounded-md border border-warning/40 bg-[color-mix(in_oklab,var(--warning)_15%,transparent)] px-4 py-2 text-center text-sm text-foreground">
            Dat moment is net niet meer beschikbaar. Kies hieronder een ander
            voorstel.
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {suggestions.map((s) => {
            const start = new Date(s.starts_at);
            const end = new Date(s.ends_at);
            return (
              <Card key={s.starts_at} className="flex flex-col p-5">
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {cap(slotFmt.format(start))}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {timeFmt.format(start)} – {timeFmt.format(end)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.duration_min} min · {s.instructor_name}
                  </p>
                  {s.pickup_location ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Ophaallocatie: {s.pickup_location}
                    </p>
                  ) : null}
                  {s.factors.length > 0 ? (
                    <ul className="mt-3 space-y-1">
                      {s.factors.map((f) => (
                        <li
                          key={f.key}
                          className="text-xs font-medium text-primary"
                        >
                          ✓ {f.label}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <form action={chooseTrialLesson} className="mt-4">
                  <input type="hidden" name="tenant_slug" value={slug} />
                  <input type="hidden" name="lead_id" value={validLeadId} />
                  <input
                    type="hidden"
                    name="instructor_id"
                    value={s.instructor_id}
                  />
                  <input type="hidden" name="starts_at" value={s.starts_at} />
                  <Button type="submit" size="sm" className="w-full">
                    Kies dit moment
                  </Button>
                </form>
              </Card>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Komt geen van deze momenten uit? Geen zorgen — {tenant.name} neemt sowieso
          contact met je op om samen een moment te plannen.
        </p>
      </div>
    </main>
  );
}
