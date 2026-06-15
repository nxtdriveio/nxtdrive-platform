import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TemplateEditorShell } from "@/app/admin/notifications/templates/[key]/[channel]/editor-shell";
import { Badge } from "@/components/ui/badge";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { getPlatformNotificationConfig } from "@/lib/notifications/platform-notification-config";
import { getShortcodesForKey } from "@/lib/notifications/shortcodes";
import {
  getTenantFeatureAccess,
  loadTenantEntitlementSnapshot,
} from "@/lib/platform/entitlements";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { saveTenantTemplate } from "../../../actions";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  email: "E-mail",
  inapp: "In-app",
  push: "Push",
};

const VALID_CHANNELS = ["email", "inapp", "push"];

function buildTenantBrandingHtml(tenantName: string): string {
  return `<!doctype html>
<html lang="nl">
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#0f172a;border-radius:12px 12px 0 0;padding:20px 24px">
      <span style="font-size:20px;font-weight:700;color:#ffffff">${tenantName}</span>
    </div>
    <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:24px;line-height:1.6;font-size:15px">
      {{INNER}}
      <p style="margin-top:32px;color:#475569;font-size:14px">Met vriendelijke groet,<br/>${tenantName}</p>
    </div>
  </div>
</body>
</html>`;
}

export default async function TenantTemplateEditorPage({
  params,
}: {
  params: Promise<{ key: string; channel: string }>;
}) {
  const [{ tenant }, { key, channel }] = await Promise.all([
    requireActiveTenant(["tenant_admin"]),
    params,
  ]);

  if (!VALID_CHANNELS.includes(channel)) notFound();

  const service = createServiceRoleClient();

  const [snapshot, platformConfig] = await Promise.all([
    loadTenantEntitlementSnapshot(service, tenant.id),
    getPlatformNotificationConfig(service, key, channel),
  ]);

  const whiteLabelGate = getTenantFeatureAccess(snapshot.tenant, "white_label", {
    requireEnabledFlag: true,
  });
  if (!whiteLabelGate.allowed) {
    redirect("/backoffice/instellingen/notificaties");
  }

  if (!platformConfig) notFound();

  const tenantName = snapshot.tenant.name ?? tenant.name ?? "Rijschool";

  const { data: tenantTemplate } = await service
    .from("notification_templates")
    .select(
      "subject, body_html, body_text, push_title, push_body, inapp_title, inapp_body",
    )
    .eq("tenant_id", tenant.id)
    .eq("key", key)
    .eq("channel", channel)
    .maybeSingle();

  const shortcodes = getShortcodesForKey(key);
  const brandingHtml = buildTenantBrandingHtml(tenantName);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/backoffice/instellingen/notificaties"
          className="text-muted-foreground hover:text-foreground"
        >
          Terug naar notificaties
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-foreground">
          {platformConfig.labelNl}
        </span>
        <Badge variant="outline" className="ml-1 text-xs">
          {CHANNEL_LABEL[channel]}
        </Badge>
      </div>

      <div>
        <h1 className="text-xl font-bold text-foreground">
          Template bewerken - {platformConfig.labelNl}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {platformConfig.description} Je eigen template overschrijft de
          NXTDRIVE-standaard voor jouw rijschool.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <TemplateEditorShell
          eventKey={key}
          channel={channel}
          labelNl={platformConfig.labelNl}
          initialSubject={
            (tenantTemplate?.subject as string | null) ?? platformConfig.subject ?? ""
          }
          initialBodyHtml={
            (tenantTemplate?.body_html as string | null) ??
            platformConfig.bodyHtml ??
            ""
          }
          initialPushTitle={
            (tenantTemplate?.push_title as string | null) ??
            platformConfig.pushTitle ??
            ""
          }
          initialPushBody={
            (tenantTemplate?.push_body as string | null) ??
            platformConfig.pushBody ??
            ""
          }
          initialInappTitle={
            (tenantTemplate?.inapp_title as string | null) ??
            platformConfig.inappTitle ??
            ""
          }
          initialInappBody={
            (tenantTemplate?.inapp_body as string | null) ??
            platformConfig.inappBody ??
            ""
          }
          shortcodes={shortcodes}
          brandingHtml={brandingHtml}
          cancelHref="/backoffice/instellingen/notificaties"
          action={saveTenantTemplate}
        />
      </div>
    </div>
  );
}
