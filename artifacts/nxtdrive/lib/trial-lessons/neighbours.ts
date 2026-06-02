// ---------------------------------------------------------------------------
// Fase 3 — Route Intelligence: resolve the appointments adjacent to a chosen
// trial lesson, with coordinates, for the backoffice map preview.
//
// Reads only coordinates already persisted upstream (lessons.location_lat/lng
// and trial_lessons.pickup_lat/lng); it never geocodes. Returns at most the
// nearest previous and next appointment that actually have coordinates, mirroring
// the neighbour semantics the suggestion engine uses for travel-time scoring.
// Server-side only (service-role client passed in).
// ---------------------------------------------------------------------------
import type { SupabaseClient } from "@supabase/supabase-js";

export type TrialNeighbour = {
  kind: "prev" | "next";
  lat: number;
  lng: number;
  label: string;
};

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

type Appt = { start: number; end: number; lat: number; lng: number; label: string };

function coord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng };
}

export async function getTrialNeighbours(
  service: SupabaseClient,
  args: {
    tenantId: string;
    instructorId: string;
    trialId: string;
    startsAt: string;
    endsAt: string;
  },
): Promise<TrialNeighbour[]> {
  const start = Date.parse(args.startsAt);
  const end = Date.parse(args.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

  const dayMs = 86400000;
  const fromIso = new Date(start - dayMs).toISOString();
  const toIso = new Date(end + dayMs).toISOString();

  const appts: Appt[] = [];

  const { data: lessons } = await service
    .from("lessons")
    .select("starts_at, ends_at, location_lat, location_lng")
    .eq("tenant_id", args.tenantId)
    .eq("instructor_id", args.instructorId)
    .eq("status", "planned")
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso);
  for (const l of lessons ?? []) {
    const c = coord(l.location_lat, l.location_lng);
    if (!c) continue;
    appts.push({
      start: Date.parse(l.starts_at as string),
      end: Date.parse(l.ends_at as string),
      lat: c.lat,
      lng: c.lng,
      label: `Les ${timeFmt.format(new Date(l.starts_at as string))}`,
    });
  }

  const { data: trials } = await service
    .from("trial_lessons")
    .select("id, starts_at, ends_at, pickup_lat, pickup_lng")
    .eq("tenant_id", args.tenantId)
    .eq("instructor_id", args.instructorId)
    .in("status", ["provisional", "confirmed"])
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso);
  for (const t of trials ?? []) {
    if (t.id === args.trialId) continue;
    const c = coord(t.pickup_lat, t.pickup_lng);
    if (!c) continue;
    appts.push({
      start: Date.parse(t.starts_at as string),
      end: Date.parse(t.ends_at as string),
      lat: c.lat,
      lng: c.lng,
      label: `Proefles ${timeFmt.format(new Date(t.starts_at as string))}`,
    });
  }

  // Nearest appointment ending at/before this trial, and starting at/after it.
  let prev: Appt | null = null;
  let next: Appt | null = null;
  for (const a of appts) {
    if (a.end <= start && (!prev || a.end > prev.end)) prev = a;
    if (a.start >= end && (!next || a.start < next.start)) next = a;
  }

  const out: TrialNeighbour[] = [];
  if (prev) out.push({ kind: "prev", lat: prev.lat, lng: prev.lng, label: prev.label });
  if (next) out.push({ kind: "next", lat: next.lat, lng: next.lng, label: next.label });
  return out;
}
