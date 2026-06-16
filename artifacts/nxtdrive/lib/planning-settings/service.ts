import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type TenantPlanningSettings = {
  rayonPolicy: "hard_block" | "warning_only" | "ignore";
  defaultTravelBufferMinutes: number;
  sameAreaTravelMinutes: number;
  differentAreaTravelMinutes: number;
  defaultLessonDurationMinutes: number;
  defaultLessonBufferMinutes: number;
};

type PlanningSettingsRow = {
  rayon_policy: TenantPlanningSettings["rayonPolicy"] | null;
  default_travel_buffer_minutes: number | null;
  same_area_travel_minutes: number | null;
  different_area_travel_minutes: number | null;
  default_lesson_duration_minutes: number | null;
  default_lesson_buffer_minutes: number | null;
};

export const DEFAULT_TENANT_PLANNING_SETTINGS: TenantPlanningSettings = {
  rayonPolicy: "hard_block",
  defaultTravelBufferMinutes: 15,
  sameAreaTravelMinutes: 10,
  differentAreaTravelMinutes: 30,
  defaultLessonDurationMinutes: 50,
  defaultLessonBufferMinutes: 0,
};

export const LESSON_DURATION_OPTIONS = [
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 150, 180, 240,
] as const;

export const LESSON_BUFFER_OPTIONS = [0, 10, 20, 30, 40, 50, 60] as const;

export function occupiedMinutes(durationMinutes: number, bufferMinutes: number) {
  return Math.max(1, durationMinutes) + Math.max(0, bufferMinutes);
}

export async function loadTenantPlanningSettings(
  client: SupabaseClient,
  tenantId: string,
): Promise<TenantPlanningSettings> {
  const { data } = await client
    .from("planning_settings")
    .select(
      [
        "rayon_policy",
        "default_travel_buffer_minutes",
        "same_area_travel_minutes",
        "different_area_travel_minutes",
        "default_lesson_duration_minutes",
        "default_lesson_buffer_minutes",
      ].join(", "),
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const row = data as PlanningSettingsRow | null;

  return {
    rayonPolicy:
      row?.rayon_policy ?? DEFAULT_TENANT_PLANNING_SETTINGS.rayonPolicy,
    defaultTravelBufferMinutes:
      row?.default_travel_buffer_minutes ??
      DEFAULT_TENANT_PLANNING_SETTINGS.defaultTravelBufferMinutes,
    sameAreaTravelMinutes:
      row?.same_area_travel_minutes ??
      DEFAULT_TENANT_PLANNING_SETTINGS.sameAreaTravelMinutes,
    differentAreaTravelMinutes:
      row?.different_area_travel_minutes ??
      DEFAULT_TENANT_PLANNING_SETTINGS.differentAreaTravelMinutes,
    defaultLessonDurationMinutes:
      row?.default_lesson_duration_minutes ??
      DEFAULT_TENANT_PLANNING_SETTINGS.defaultLessonDurationMinutes,
    defaultLessonBufferMinutes:
      row?.default_lesson_buffer_minutes ??
      DEFAULT_TENANT_PLANNING_SETTINGS.defaultLessonBufferMinutes,
  };
}
