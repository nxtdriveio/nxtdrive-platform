import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ensureBookingRequest,
  replaceBookingCandidates,
} from "@/lib/smart-booking/service";
import {
  trialLeadBookingRequestInput,
  trialSuggestionToBookingCandidate,
} from "@/lib/smart-booking/trial";
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

function requiredTransmission(value: string | null | undefined) {
  if (value === "manual") return "schakel";
  if (value === "automatic") return "automaat";
  return null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export default async function IntakeThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    lead?: string;
    booked?: string;
    preferred?: string;
    slot?: string;
  }>;
}) {
  const { slug } = await params;
  const { lead: leadId, booked, preferred, slot } = await searchParams;
  const service = createServiceRoleClient();
  const { data: tenant } = await service
    .from("tenants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  // Verify the lead belongs to this tenant before doing anything lead-specific.
  let validLeadId: string | null = null;
  let leadContext: {
    id: string;
    branch_id: string | null;
    preferred_transmission: string | null;
  } | null = null;
  let intakeContext: {
    pickup_location: string | null;
    pickup_lat: number | null;
    pickup_lng: number | null;
    pickup_place_id: string | null;
    pickup_formatted_address: string | null;
    preferred_days: unknown;
    preferred_times: unknown;
    desired_start_date: string | null;
  } | null = null;
  if (leadId) {
    const { data: leadRow } = await service
      .from("leads")
      .select("id, branch_id, preferred_transmission")
      .eq("id", leadId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    leadContext = leadRow ?? null;
    validLeadId = leadContext?.id ?? null;
  }

  if (validLeadId) {
    const { data: intakeRow } = await service
      .from("lead_intake_details")
      .select(
        "pickup_location, pickup_lat, pickup_lng, pickup_place_id, pickup_formatted_address, preferred_days, preferred_times, desired_start_date",
      )
      .eq("lead_id", validLeadId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    intakeContext = intakeRow ?? null;
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

  if (validLeadId && leadContext && suggestions.length > 0 && !bookedTrial) {
    try {
      const bookingRequestId = await ensureBookingRequest(
        service,
        trialLeadBookingRequestInput({
          tenantId: tenant.id,
          branchId: leadContext.branch_id,
          leadId: validLeadId,
          requestedDurationMin: suggestions[0]?.duration_min ?? 60,
          requiredTransmission: requiredTransmission(
            leadContext.preferred_transmission,
          ),
          pickupLocation:
            suggestions[0]?.pickup_location ??
            intakeContext?.pickup_formatted_address ??
            intakeContext?.pickup_location ??
            null,
          pickupLat: suggestions[0]?.pickup_lat ?? intakeContext?.pickup_lat ?? null,
          pickupLng: suggestions[0]?.pickup_lng ?? intakeContext?.pickup_lng ?? null,
          pickupPlaceId:
            suggestions[0]?.pickup_place_id ?? intakeContext?.pickup_place_id ?? null,
          pickupFormattedAddress:
            suggestions[0]?.pickup_formatted_address ??
            intakeContext?.pickup_formatted_address ??
            null,
          preferredDays: stringArray(intakeContext?.preferred_days),
          preferredTimes: stringArray(intakeContext?.preferred_times),
          desiredStartDate: intakeContext?.desired_start_date ?? null,
        }),
      );

      await replaceBookingCandidates(service, {
        tenantId: tenant.id,
        bookingRequestId,
        actor: null,
        candidates: suggestions.map((suggestion, index) =>
          trialSuggestionToBookingCandidate(suggestion, index + 1),
        ),
      });
    } catch (e) {
      console.error("[smart-booking] persist trial suggestions failed", e);
    }
  }

  // --- Preference-only state (canon phase 2) --------------------------------
  if (!bookedTrial && preferred === "1") {
    return (
      <main className="bg-nxt-grid relative flex min-h-screen items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md p-8 text-center">
          <NxtdriveLogo className="mx-auto text-xl" />
          <h1 className="mt-6 text-2xl font-semibold text-foreground">
            Je voorkeur is ontvangen
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tenant.name} ziet jouw gekozen moment met de score en uitleg in de
            backoffice. De rijschool bevestigt de proefles definitief voordat er
            iets in de agenda komt.
          </p>
        </Card>
      </main>
    );
  }

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
                    Kies als voorkeur
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
