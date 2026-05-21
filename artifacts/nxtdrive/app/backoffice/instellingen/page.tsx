import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getMollieApiKeyStatus } from "@/lib/mollie/secrets";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { saveMollieApiKey } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const sp = await searchParams;
  const result = typeof sp.mollie === "string" ? sp.mollie : null;
  const reason = typeof sp.reason === "string" ? sp.reason : null;

  const service = createServiceRoleClient();
  const status = await getMollieApiKeyStatus(service, tenant.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Instellingen
        </h1>
        <p className="text-sm text-muted-foreground">
          Tenant-specifieke configuratie voor {tenant.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Mollie betaalintegratie
            {status.configured ? (
              <Badge variant={status.mode === "live" ? "success" : "info"}>
                {status.mode === "live" ? "Live modus" : "Test modus"}
              </Badge>
            ) : (
              <Badge variant="warning">Niet geconfigureerd</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Plak hier de API-sleutel uit je Mollie-dashboard. We slaan hem
            versleuteld op (AES-256-GCM). De sleutel wordt nooit terug
            getoond. Gebruik een{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">test_…</code>{" "}
            sleutel zolang je nog test.
          </p>

          {status.configured && status.preview ? (
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Huidige sleutel:</span>{" "}
              <code className="font-mono text-foreground">
                {status.preview}
              </code>
            </div>
          ) : null}

          {result === "saved" ? (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              Mollie API-sleutel opgeslagen.
            </p>
          ) : null}
          {result === "empty" ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              Vul een API-sleutel in.
            </p>
          ) : null}
          {result === "error" ? (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              Sleutel niet opgeslagen: {reason ?? "onbekende fout"}.
            </p>
          ) : null}

          <form action={saveMollieApiKey} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="api_key">Mollie API-sleutel</Label>
              <Input
                id="api_key"
                name="api_key"
                type="password"
                autoComplete="off"
                placeholder="test_..."
                required
              />
            </div>
            <Button type="submit" size="sm">
              {status.configured ? "Sleutel vervangen" : "Sleutel opslaan"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
