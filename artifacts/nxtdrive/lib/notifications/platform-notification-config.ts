/**
 * Platform-niveau notificatieconfiguratie service.
 *
 * Leest `platform_notification_config` voor globale aan/uit-vlaggen en
 * platform-standaard templateinhoud. Leest `notification_templates` voor
 * de tenant_enabled kolom (per-tenant override van de globale vlag).
 *
 * Schrijfoperaties lopen via service_role — nooit client-side.
 *
 * Lookup-prioriteit voor templateinhoud (applyOverride in templates.ts):
 *   1. Tenant white-label override in notification_templates (subject/body)
 *   2. Platform-standaard uit platform_notification_config
 *   3. Hardcode fallback in templates.ts
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlatformNotificationConfig = {
  eventKey: string;
  channel: string;
  globallyEnabled: boolean;
  labelNl: string;
  description: string;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  pushTitle: string | null;
  pushBody: string | null;
  inappTitle: string | null;
  inappBody: string | null;
  updatedAt: string;
};

export type PlatformConfigPatch = Partial<{
  globallyEnabled: boolean;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  pushTitle: string | null;
  pushBody: string | null;
  inappTitle: string | null;
  inappBody: string | null;
}>;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Laad alle platform_notification_config rijen, gesorteerd op event_key + channel.
 * Gebruikt service_role (tabel is dicht voor authenticated).
 */
export async function getAllPlatformNotificationConfigs(
  service: SupabaseClient,
): Promise<PlatformNotificationConfig[]> {
  const { data, error } = await service
    .from("platform_notification_config")
    .select(
      "event_key, channel, globally_enabled, label_nl, description, subject, body_html, body_text, push_title, push_body, inapp_title, inapp_body, updated_at",
    )
    .order("event_key", { ascending: true })
    .order("channel", { ascending: true });

  if (error) throw new Error(`getAllPlatformNotificationConfigs: ${error.message}`);

  return (data ?? []).map(mapRow);
}

/**
 * Laad één platform_notification_config rij voor een specifieke (event_key, channel).
 * Geeft null als de rij niet bestaat (valt dan terug op hardcode defaults).
 */
export async function getPlatformNotificationConfig(
  service: SupabaseClient,
  eventKey: string,
  channel: string,
): Promise<PlatformNotificationConfig | null> {
  const { data, error } = await service
    .from("platform_notification_config")
    .select(
      "event_key, channel, globally_enabled, label_nl, description, subject, body_html, body_text, push_title, push_body, inapp_title, inapp_body, updated_at",
    )
    .eq("event_key", eventKey)
    .eq("channel", channel)
    .maybeSingle();

  if (error) throw new Error(`getPlatformNotificationConfig: ${error.message}`);
  if (!data) return null;
  return mapRow(data);
}

/**
 * Geeft true als de globale platformvlag voor (event_key, channel) aan staat.
 * Ontbrekende rij = true (default-on: als de rij niet bestaat doet het systeem
 * het alsof het ingeschakeld is, zodat nieuwe triggers niet per abuis stoppen).
 */
export async function isPlatformTriggerEnabled(
  service: SupabaseClient,
  eventKey: string,
  channel: string,
): Promise<boolean> {
  const { data } = await service
    .from("platform_notification_config")
    .select("globally_enabled")
    .eq("event_key", eventKey)
    .eq("channel", channel)
    .maybeSingle();

  if (!data) return true;
  return Boolean(data.globally_enabled);
}

/**
 * Geeft true als een tenant-trigger doorgelaten mag worden. Logica:
 *   - Als globally_enabled = false → altijd false (platform wint).
 *   - Als notification_templates.tenant_enabled = false → false.
 *   - Als notification_templates.tenant_enabled = true of null → true.
 * Geen bestaande rij in notification_templates → volgt global (true als global true).
 */
export async function isTenantTriggerEnabled(
  service: SupabaseClient,
  tenantId: string,
  eventKey: string,
  channel: string,
): Promise<boolean> {
  const [globalRow, tenantRow] = await Promise.all([
    service
      .from("platform_notification_config")
      .select("globally_enabled")
      .eq("event_key", eventKey)
      .eq("channel", channel)
      .maybeSingle(),
    service
      .from("notification_templates")
      .select("tenant_enabled")
      .eq("tenant_id", tenantId)
      .eq("key", eventKey)
      .eq("channel", channel)
      .maybeSingle(),
  ]);

  const globallyEnabled = globalRow.data ? Boolean(globalRow.data.globally_enabled) : true;
  if (!globallyEnabled) return false;

  const tenantEnabled = tenantRow.data?.tenant_enabled;
  if (tenantEnabled === false) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Writes (service_role only, via server actions)
// ---------------------------------------------------------------------------

/**
 * Sla een platform_notification_config patch op. Alleen de meegeleverde velden
 * worden bijgewerkt. Audit log via de bestaande audit_log tabel.
 */
export async function updatePlatformNotificationConfig(
  service: SupabaseClient,
  actorUserId: string,
  eventKey: string,
  channel: string,
  patch: PlatformConfigPatch,
): Promise<void> {
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.globallyEnabled !== undefined) updatePayload.globally_enabled = patch.globallyEnabled;
  if (patch.subject !== undefined) updatePayload.subject = patch.subject;
  if (patch.bodyHtml !== undefined) updatePayload.body_html = patch.bodyHtml;
  if (patch.bodyText !== undefined) updatePayload.body_text = patch.bodyText;
  if (patch.pushTitle !== undefined) updatePayload.push_title = patch.pushTitle;
  if (patch.pushBody !== undefined) updatePayload.push_body = patch.pushBody;
  if (patch.inappTitle !== undefined) updatePayload.inapp_title = patch.inappTitle;
  if (patch.inappBody !== undefined) updatePayload.inapp_body = patch.inappBody;

  const { error } = await service
    .from("platform_notification_config")
    .update(updatePayload)
    .eq("event_key", eventKey)
    .eq("channel", channel);

  if (error) throw new Error(`updatePlatformNotificationConfig: ${error.message}`);

  await service.from("audit_log").insert({
    actor_user_id: actorUserId,
    tenant_id: null,
    action: "platform_notification_config.updated",
    target_type: "platform_notification_config",
    target_id: `${eventKey}:${channel}`,
    payload: { event_key: eventKey, channel, patch },
  });
}

/**
 * Sla een tenant-specifieke toggle op in notification_templates.tenant_enabled.
 * Upsert: maakt de rij aan als die nog niet bestaat.
 */
export async function setTenantNotificationEnabled(
  service: SupabaseClient,
  actorUserId: string,
  tenantId: string,
  eventKey: string,
  channel: string,
  enabled: boolean | null,
): Promise<void> {
  const { error } = await service.from("notification_templates").upsert(
    {
      tenant_id: tenantId,
      key: eventKey,
      channel,
      tenant_enabled: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,key,channel" },
  );

  if (error) throw new Error(`setTenantNotificationEnabled: ${error.message}`);

  await service.from("audit_log").insert({
    actor_user_id: actorUserId,
    tenant_id: tenantId,
    action: "notification_template.tenant_enabled_updated",
    target_type: "notification_template",
    target_id: `${eventKey}:${channel}`,
    payload: { event_key: eventKey, channel, tenant_enabled: enabled },
  });
}

/**
 * Sla een white-label tenant template op in notification_templates.
 * Alleen white-label tenants mogen dit aanroepen (check in server action).
 */
export async function setTenantNotificationTemplate(
  service: SupabaseClient,
  actorUserId: string,
  tenantId: string,
  eventKey: string,
  channel: string,
  template: {
    subject?: string | null;
    bodyHtml?: string | null;
    bodyText?: string | null;
    pushTitle?: string | null;
    pushBody?: string | null;
    inappTitle?: string | null;
    inappBody?: string | null;
  },
): Promise<void> {
  const upsertPayload: Record<string, unknown> = {
    tenant_id: tenantId,
    key: eventKey,
    channel,
    updated_at: new Date().toISOString(),
  };
  if (template.subject !== undefined) upsertPayload.subject = template.subject;
  if (template.bodyHtml !== undefined) upsertPayload.body_html = template.bodyHtml;
  if (template.bodyText !== undefined) upsertPayload.body_text = template.bodyText;
  if (template.pushTitle !== undefined) upsertPayload.push_title = template.pushTitle;
  if (template.pushBody !== undefined) upsertPayload.push_body = template.pushBody;
  if (template.inappTitle !== undefined) upsertPayload.inapp_title = template.inappTitle;
  if (template.inappBody !== undefined) upsertPayload.inapp_body = template.inappBody;

  const { error } = await service
    .from("notification_templates")
    .upsert(upsertPayload, { onConflict: "tenant_id,key,channel" });

  if (error) throw new Error(`setTenantNotificationTemplate: ${error.message}`);

  await service.from("audit_log").insert({
    actor_user_id: actorUserId,
    tenant_id: tenantId,
    action: "notification_template.updated",
    target_type: "notification_template",
    target_id: `${eventKey}:${channel}`,
    payload: { event_key: eventKey, channel },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(data: Record<string, unknown>): PlatformNotificationConfig {
  return {
    eventKey: data.event_key as string,
    channel: data.channel as string,
    globallyEnabled: Boolean(data.globally_enabled),
    labelNl: (data.label_nl as string | null) ?? "",
    description: (data.description as string | null) ?? "",
    subject: (data.subject as string | null) ?? null,
    bodyHtml: (data.body_html as string | null) ?? null,
    bodyText: (data.body_text as string | null) ?? null,
    pushTitle: (data.push_title as string | null) ?? null,
    pushBody: (data.push_body as string | null) ?? null,
    inappTitle: (data.inapp_title as string | null) ?? null,
    inappBody: (data.inapp_body as string | null) ?? null,
    updatedAt: (data.updated_at as string) ?? "",
  };
}
