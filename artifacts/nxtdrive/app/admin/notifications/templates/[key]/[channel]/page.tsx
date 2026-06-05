import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getPlatformNotificationConfig } from "@/lib/notifications/platform-notification-config";
import { getShortcodesForKey } from "@/lib/notifications/shortcodes";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Badge } from "@/components/ui/badge";
import { TemplateEditorClient } from "./editor-client";
import { savePlatformTemplate } from "../../../actions";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  email: "E-mail",
  inapp: "In-app",
  push: "Push",
};

const VALID_CHANNELS = ["email", "inapp", "push"];

/** NXTDRIVE-branded HTML shell for the preview panel. */
function buildBrandingHtml(): string {
  const accent = "#0f172a";
  const onAccent = "#ffffff";
  return `<!doctype html>
<html lang="nl">
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:${accent};border-radius:12px 12px 0 0;padding:20px 24px">
      <span style="font-size:20px;font-weight:700;color:${onAccent}">NXTDRIVE Demo Academy</span>
    </div>
    <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:24px;line-height:1.6;font-size:15px">
      {{INNER}}
      <p style="margin-top:32px;color:#475569;font-size:14px">Met vriendelijke groet,<br/>NXTDRIVE Demo Academy</p>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px">Verzonden via NXTDRIVE</p>
  </div>
</body>
</html>`;
}

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ key: string; channel: string }>;
}) {
  const [user, { key, channel }] = await Promise.all([requirePlatformAdmin(), params]);

  if (!VALID_CHANNELS.includes(channel)) notFound();

  const service = createServiceRoleClient();
  const config = await getPlatformNotificationConfig(service, key, channel);

  if (!config) notFound();

  const shortcodes = getShortcodesForKey(key);
  const brandingHtml = buildBrandingHtml();

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-8">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/admin" className="text-muted-foreground hover:text-foreground">Admin</Link>
            <span className="text-muted-foreground">/</span>
            <Link href="/admin/notifications?tab=templates" className="text-muted-foreground hover:text-foreground">
              Notificaties
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">{config.labelNl}</span>
            <Badge variant="outline" className="ml-1 text-xs">{CHANNEL_LABEL[channel]}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:block">
              {user.profile?.full_name ?? user.email}
            </span>
            <Badge variant="primary" className="text-xs">platform admin</Badge>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-6 space-y-1">
          <h1 className="text-xl font-bold text-foreground">{config.labelNl}</h1>
          <p className="text-sm text-muted-foreground">{config.description}</p>
          <div className="flex items-center gap-2 pt-1">
            <span className="font-mono text-xs text-muted-foreground">{key}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{CHANNEL_LABEL[channel]}</span>
            {config.globallyEnabled ? (
              <Badge variant="success" className="text-xs">Ingeschakeld</Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">Uitgeschakeld</Badge>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <TemplateEditorClient
            eventKey={key}
            channel={channel}
            labelNl={config.labelNl}
            initialSubject={config.subject ?? ""}
            initialBodyHtml={config.bodyHtml ?? ""}
            initialPushTitle={config.pushTitle ?? ""}
            initialPushBody={config.pushBody ?? ""}
            initialInappTitle={config.inappTitle ?? ""}
            initialInappBody={config.inappBody ?? ""}
            shortcodes={shortcodes}
            brandingHtml={brandingHtml}
            cancelHref={
              channel === "email"
                ? "/admin/notifications?tab=templates"
                : "/admin/notifications"
            }
            action={savePlatformTemplate}
          />
        </div>
      </div>
    </main>
  );
}
