"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { KeyRound, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PasswordField, getPasswordStrength } from "@/components/ui/password-field";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";

export default function WachtwoordWijzigenPage() {
  const router = useRouter();
  const [wachtwoord, setWachtwoord] = React.useState("");
  const [bevestig, setBevestig] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const strength = wachtwoord ? getPasswordStrength(wachtwoord) : null;
  const tooWeak = wachtwoord ? (strength?.score ?? 0) < 2 : false;
  const mismatch = bevestig.length > 0 && bevestig !== wachtwoord;
  const canSubmit = wachtwoord.length > 0 && bevestig.length > 0 && !tooWeak && !mismatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setPending(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();

    const { error: updateError } = await supabase.auth.updateUser({
      password: wachtwoord,
      data: { must_change_password: false },
    });

    if (updateError) {
      setError(updateError.message);
      setPending(false);
      return;
    }

    setDone(true);
    setTimeout(() => router.push("/student"), 2000);
  }

  return (
    <main className="bg-nxt-grid relative flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-10">
      <Card className="w-full max-w-sm space-y-6 p-8">
        <div className="text-center">
          <NxtdriveLogo className="mx-auto text-xl" />
          <div className="mt-5 flex justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-foreground">
            Wachtwoord instellen
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stel een nieuw wachtwoord in voor je account. Je doet dit éénmalig
            bij je eerste login.
          </p>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle className="h-10 w-10 text-success" />
            <p className="font-medium text-foreground">Wachtwoord ingesteld</p>
            <p className="text-sm text-muted-foreground">
              Je wordt doorgestuurd naar je omgeving…
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordField
              id="nieuw-wachtwoord"
              name="wachtwoord"
              label="Nieuw wachtwoord"
              value={wachtwoord}
              onChange={setWachtwoord}
              showStrength
              minScore={2}
              autoComplete="new-password"
              required
            />

            <PasswordField
              id="bevestig-wachtwoord"
              name="bevestig"
              label="Bevestig wachtwoord"
              value={bevestig}
              onChange={setBevestig}
              error={mismatch ? "Wachtwoorden komen niet overeen." : null}
              autoComplete="new-password"
              required
            />

            {error ? (
              <div className="rounded-md border border-danger/30 bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] p-3 text-sm text-danger">
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={pending || !canSubmit}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Wachtwoord instellen
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
