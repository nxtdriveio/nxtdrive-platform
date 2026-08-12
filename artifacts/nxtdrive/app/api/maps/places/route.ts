import { NextResponse } from "next/server";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { GoogleLocationProvider } from "@/domains/maps/infrastructure/google/google-location-provider";
import { MeteredLocationProvider } from "@/domains/maps/infrastructure/metering/metered-location-provider";
import { SupabaseMapsMeter } from "@/domains/maps/infrastructure/metering/supabase-maps-meter";
import { RpcMapsFeatureGate } from "@/domains/maps/infrastructure/metering/rpc-feature-gate";
import type { ResolvedPlace } from "@/domains/maps/application/contracts";
import type { MapsUsageEventInput } from "@/domains/maps/domain/types";

export const dynamic = "force-dynamic";

const ROLES = [
  "student",
  "parent",
  "instructor",
  "tenant_admin",
  "branch_manager",
  "planner",
  "admin_staff",
] as const;

type RequestBody =
  | {
      action: "autocomplete";
      query: string;
      sessionToken: string;
      correlationId: string;
      surface?: "INSTRUCTOR_APPOINTMENT_WIZARD";
    }
  | {
      action: "resolve";
      providerReference: string;
      sessionToken: string;
      correlationId: string;
      surface?: "INSTRUCTOR_APPOINTMENT_WIZARD";
    }
  | {
      action: "validate";
      address: Omit<
        ResolvedPlace,
        "provider" | "providerPlaceId" | "obtainedAt"
      >;
      correlationId: string;
      surface?: "INSTRUCTOR_APPOINTMENT_WIZARD";
    };

export async function POST(request: Request) {
  const { user, tenant, roles } = await requireActiveTenant([...ROLES]);
  const limit = await consumeRateLimit({
    purpose: "maps_provider",
    identifiers: [tenant.id, user.id],
  });
  const headers = {
    ...rateLimitHeaders(limit),
    "Cache-Control": "private, no-store",
  };
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Te veel adresaanvragen. Handmatige invoer blijft beschikbaar.",
        degradedMode: "MANUAL",
      },
      { status: 429, headers },
    );
  }
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body || !isCorrelationId(body.correlationId)) {
    return NextResponse.json(
      { error: "Ongeldige adresaanvraag." },
      { status: 400, headers },
    );
  }

  const service = createServiceRoleClient();
  const featureCode =
    body.action === "autocomplete"
      ? "ADDRESS_AUTOCOMPLETE"
      : body.action === "resolve"
        ? "PLACE_DETAILS"
        : "ADDRESS_VALIDATION";
  const availability = await new RpcMapsFeatureGate(service).evaluate({
    tenantId: tenant.id,
    featureCode,
    requestedUnits: 1,
    environment: environment(),
  });
  if (availability.mode !== "PROVIDER") {
    return NextResponse.json(
      {
        error: "Adresprovider is niet beschikbaar.",
        degradedMode: "MANUAL",
        reason: availability.reason,
      },
      { status: 503, headers },
    );
  }

  const surface: MapsUsageEventInput["surface"] =
    body.surface === "INSTRUCTOR_APPOINTMENT_WIZARD" &&
    roles.includes("instructor")
      ? "INSTRUCTOR_APPOINTMENT_WIZARD"
      : roles.some((role) => ["student", "parent"].includes(role))
        ? "STUDENT_PROFILE"
        : roles.includes("instructor")
          ? "INSTRUCTOR_APP"
          : "LESSON_PLANNER";
  const provider = new MeteredLocationProvider({
    provider: new GoogleLocationProvider(),
    meter: new SupabaseMapsMeter(service),
    environment: environment(),
    surface,
  });

  try {
    if (body.action === "autocomplete") {
      return NextResponse.json(
        {
          suggestions: await provider.autocomplete({
            tenantId: tenant.id,
            query: body.query,
            sessionToken: body.sessionToken,
            countryCodes: ["NL"],
            correlationId: body.correlationId,
          }),
        },
        { headers },
      );
    }
    if (body.action === "resolve") {
      return NextResponse.json(
        {
          place: await provider.resolvePlace({
            tenantId: tenant.id,
            providerReference: body.providerReference,
            sessionToken: body.sessionToken,
            correlationId: body.correlationId,
          }),
        },
        { headers },
      );
    }
    return NextResponse.json(
      {
        validation: await provider.validateAddress({
          tenantId: tenant.id,
          address: body.address,
          correlationId: body.correlationId,
        }),
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error: "Adresprovider reageert niet. Vul het adres handmatig in.",
        degradedMode: "MANUAL",
      },
      { status: 503, headers },
    );
  }
}

function environment(): MapsUsageEventInput["environment"] {
  return process.env.VERCEL_ENV === "production"
    ? "PRODUCTION"
    : process.env.VERCEL_ENV === "preview"
      ? "STAGING"
      : "LOCAL";
}

function isCorrelationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)
  );
}
