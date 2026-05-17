import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { sendMagicLink, signInWithPassword } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const errorMsg = params.error;

  return (
    <main className="bg-nxt-grid relative flex min-h-screen items-center justify-center px-6 py-10">
      <Card className="w-full max-w-sm space-y-6 p-8">
        <div className="text-center">
          <NxtdriveLogo className="mx-auto text-xl" />
          <h1 className="mt-5 text-2xl font-semibold text-foreground">Inloggen</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Log in met je e-mailadres en wachtwoord.
          </p>
        </div>

        {sent ? (
          <div className="rounded-md border border-success/30 bg-[color-mix(in_oklab,var(--success)_10%,transparent)] p-3 text-sm text-success">
            Check je inbox — we hebben je een inloglink gestuurd.
          </div>
        ) : null}

        {errorMsg ? (
          <div className="rounded-md border border-danger/30 bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] p-3 text-sm text-danger">
            {decodeURIComponent(errorMsg)}
          </div>
        ) : null}

        <form action={signInWithPassword} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mailadres</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="naam@rijschool.nl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Wachtwoord</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full">
            Inloggen
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wide">
            <span className="bg-card px-2 text-muted-foreground">of</span>
          </div>
        </div>

        <form action={sendMagicLink} className="space-y-3">
          <p className="text-center text-xs text-muted-foreground">
            Wachtwoord vergeten? Vul hierboven je e-mailadres in en vraag een
            inloglink aan.
          </p>
          <Button type="submit" variant="outline" className="w-full">
            Stuur inloglink per e-mail
          </Button>
        </form>
      </Card>
    </main>
  );
}
