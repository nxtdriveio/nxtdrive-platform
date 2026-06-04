import { Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveEmailConfig } from "./actions";
import type { EmailConfigStatus } from "@/lib/email/config";

type Props = {
  status: EmailConfigStatus;
  result: string | null;
  reason: string | null;
};

export function EmailSettingsManager({ status, result, reason }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Koppel je eigen SendGrid-account zodat welkomstmails, lescherinneringen
        en factuurmails worden verstuurd vanaf jouw eigen domeinnaam. Voer de
        API-sleutel in vanuit{" "}
        <span className="font-medium text-foreground">
          SendGrid → Settings → API Keys
        </span>{" "}
        en het geverifieerde afzenderadres.
      </p>

      {status.configured ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <span className="font-medium text-foreground">Geconfigureerd</span>
          </div>
          {status.keyPreview ? (
            <div className="ml-6 text-muted-foreground">
              Sleutel:{" "}
              <code className="font-mono text-foreground">{status.keyPreview}</code>
            </div>
          ) : null}
          {status.fromEmail ? (
            <div className="ml-6 text-muted-foreground">
              Afzender:{" "}
              <code className="font-mono text-foreground">{status.fromEmail}</code>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-[color-mix(in_oklab,var(--warning,#f59e0b)_8%,transparent)] px-3 py-2.5 text-sm text-warning">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            Nog niet geconfigureerd. E-mails worden pas verstuurd nadat je een
            API-sleutel en afzenderadres hebt opgeslagen.
          </span>
        </div>
      )}

      {result === "saved" ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          E-mailinstellingen opgeslagen.
        </p>
      ) : null}
      {result === "error" ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          Niet opgeslagen: {reason ?? "onbekende fout"}.
        </p>
      ) : null}

      <form action={saveEmailConfig} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="sg_api_key">
            SendGrid API-sleutel{" "}
            {status.configured ? (
              <span className="text-muted-foreground">(laat leeg om te bewaren)</span>
            ) : (
              <span className="text-danger">*</span>
            )}
          </Label>
          <Input
            id="sg_api_key"
            name="sg_api_key"
            type="password"
            autoComplete="off"
            placeholder="SG.xxxxxxxxxx..."
          />
          <p className="text-xs text-muted-foreground">
            Gebruik een sleutel met minimaal <em>Mail Send</em>-rechten.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="from_email">
            Afzenderadres <span className="text-danger">*</span>
          </Label>
          <Input
            id="from_email"
            name="from_email"
            type="email"
            autoComplete="off"
            placeholder="info@jouwrijschool.nl"
            defaultValue={status.fromEmail ?? ""}
            required
          />
          <p className="text-xs text-muted-foreground">
            Dit adres moet geverifieerd zijn in SendGrid (Sender Authentication).
          </p>
        </div>

        <Button type="submit" size="sm">
          <Mail className="mr-1.5 h-3.5 w-3.5" />
          {status.configured ? "Instellingen bijwerken" : "Instellingen opslaan"}
        </Button>
      </form>
    </div>
  );
}
