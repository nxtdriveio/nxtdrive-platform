import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { LEAD_SOURCES, LEAD_SOURCE_LABEL } from "@/lib/leads/types";
import { submitIntake } from "./actions";

export const dynamic = "force-dynamic";

export default async function IntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  // Public page: look up tenant via service role (RLS would block anon).
  const service = createServiceRoleClient();
  const { data: tenant } = await service
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();

  if (!tenant) notFound();

  return (
    <main className="bg-nxt-grid relative min-h-screen px-6 py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <NxtdriveLogo className="text-xl" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
            Aanmelden bij {tenant.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vul je gegevens in — we nemen zo snel mogelijk contact met je op.
          </p>
        </div>

        <Card className="p-6">
          {error ? (
            <div className="mb-4 rounded-md border border-danger/30 bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] p-3 text-sm text-danger">
              {decodeURIComponent(error)}
            </div>
          ) : null}

          <form action={submitIntake} className="space-y-4">
            <input type="hidden" name="tenant_slug" value={tenant.slug} />

            <div className="space-y-1.5">
              <Label htmlFor="full_name">Naam</Label>
              <Input
                id="full_name"
                name="full_name"
                required
                autoComplete="name"
                placeholder="Voor- en achternaam"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mailadres</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="jij@email.nl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefoon</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="06 12 34 56 78"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="postcode">Postcode</Label>
                <Input
                  id="postcode"
                  name="postcode"
                  autoComplete="postal-code"
                  placeholder="1234 AB"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="source">Hoe heb je ons gevonden?</Label>
                <Select id="source" name="source" defaultValue="website">
                  {LEAD_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_SOURCE_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="message">Bericht (optioneel)</Label>
              <Textarea
                id="message"
                name="message"
                maxLength={2000}
                placeholder="Vertel kort wat je wilt weten of wanneer je wilt starten."
              />
            </div>

            {/* Honeypot — bots fill this; legit users never see it */}
            <input
              type="text"
              name="website_url"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute left-[-9999px] h-0 w-0 opacity-0"
            />

            <p className="text-xs text-muted-foreground">
              We mailen of bellen je terug. Eén van de velden e-mail of
              telefoon is verplicht.
            </p>

            <Button type="submit" size="lg" className="w-full">
              Aanmelden
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Powered by{" "}
          <span className="font-semibold text-foreground">NXTDRIVE</span>
        </p>
      </div>
    </main>
  );
}
