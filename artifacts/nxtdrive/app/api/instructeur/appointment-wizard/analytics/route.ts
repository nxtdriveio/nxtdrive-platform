import { NextResponse } from "next/server";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";

const EVENTS = new Set([
  "appointment_wizard_opened",
  "appointment_type_selected",
  "student_search_started",
  "student_selected",
  "pickup_changed",
  "duration_changed",
  "buffer_changed",
  "vehicle_auto_resolved",
  "vehicle_selection_required",
  "planning_warning_shown",
  "appointment_wizard_completed",
  "appointment_wizard_cancelled",
]);

const TYPES = new Set([
  "lesson",
  "exam",
  "interim_test",
  "theory_guidance",
  "free_block",
  "break",
  "private_block",
  "maintenance",
  "admin",
  "vacation",
]);

const STEPS = new Set([
  "TYPE",
  "STUDENT",
  "PICKUP",
  "PRIVATE_DETAILS",
  "DESTINATION",
  "SCHEDULE",
  "VEHICLE",
  "SUMMARY",
]);

export async function POST(request: Request) {
  const { user, tenant } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const event = typeof body?.event === "string" ? body.event : "";
  if (!EVENTS.has(event)) {
    return NextResponse.json({ error: "Ongeldig event." }, { status: 400 });
  }

  const appointmentType =
    typeof body?.appointmentType === "string" && TYPES.has(body.appointmentType)
      ? body.appointmentType
      : null;
  const step =
    typeof body?.step === "string" && STEPS.has(body.step) ? body.step : null;
  const durationMs = boundedInteger(body?.durationMs, 0, 86_400_000);
  const taps = boundedInteger(body?.taps, 0, 1_000);
  const flags = Object.fromEntries(
    ["vehicleAutoResolved", "defaultPickup", "blocking", "success"]
      .filter((key) => typeof body?.[key] === "boolean")
      .map((key) => [key, body?.[key]]),
  );

  const service = createServiceRoleClient();
  const { error } = await service.from("appointment_wizard_analytics").insert({
    tenant_id: tenant.id,
    actor_user_id: user.id,
    event_name: event,
    appointment_type_code: appointmentType,
    step_code: step,
    duration_ms: durationMs,
    taps,
    flags,
  });
  if (error) {
    return NextResponse.json(
      { error: "Analytics konden niet worden opgeslagen." },
      { status: 503 },
    );
  }
  return new NextResponse(null, { status: 204 });
}

function boundedInteger(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return Math.min(max, Math.max(min, value));
}
