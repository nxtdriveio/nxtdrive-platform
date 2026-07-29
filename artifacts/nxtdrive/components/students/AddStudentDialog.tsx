"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createStudentDirect } from "@/app/backoffice/leerlingen/actions";
import { defaultEducationTypeForInstructor } from "@/lib/students/create-profile";

export function AddStudentDialog({
  ris20Qualified = false,
}: {
  ris20Qualified?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [emailWarning, setEmailWarning] = React.useState<string | null>(null);

  const [naam, setNaam] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [telefoon, setTelefoon] = React.useState("");
  const [postcode, setPostcode] = React.useState("");
  const [geboortedatum, setGeboortedatum] = React.useState("");
  const [adres, setAdres] = React.useState("");
  const [woonplaats, setWoonplaats] = React.useState("");
  const [ophaaladres, setOphaaladres] = React.useState("");
  const [opleidingstype, setOpleidingstype] = React.useState<
    "STANDARD" | "RIS_2_0"
  >(defaultEducationTypeForInstructor(ris20Qualified));
  const [startdatum, setStartdatum] = React.useState("");
  const [privacyConfirmed, setPrivacyConfirmed] = React.useState(false);

  function reset() {
    setNaam("");
    setEmail("");
    setTelefoon("");
    setPostcode("");
    setGeboortedatum("");
    setAdres("");
    setWoonplaats("");
    setOphaaladres("");
    setOpleidingstype(defaultEducationTypeForInstructor(ris20Qualified));
    setStartdatum("");
    setPrivacyConfirmed(false);
    setError(null);
    setDone(false);
    setEmailWarning(null);
    setPending(false);
  }

  function handleOpen(val: boolean) {
    setOpen(val);
    if (!val) reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setPending(true);
    setError(null);
    setEmailWarning(null);

    const fd = new FormData();
    fd.set("naam", naam);
    fd.set("email", email);
    fd.set("telefoon", telefoon);
    fd.set("postcode", postcode);
    fd.set("geboortedatum", geboortedatum);
    fd.set("adres", adres);
    fd.set("woonplaats", woonplaats);
    fd.set("ophaaladres", ophaaladres);
    fd.set("opleidingstype", opleidingstype);
    fd.set("startdatum", startdatum);
    fd.set("privacy_confirmed", String(privacyConfirmed));

    try {
      const result = await createStudentDirect(fd);
      if (result.ok) {
        setEmailWarning(result.emailWarning ?? null);
        setDone(true);
        router.refresh();
      } else {
        setError(result.error ?? "Er is een fout opgetreden.");
      }
    } catch {
      setError("Er is een onverwachte fout opgetreden.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="md" className="min-h-11 gap-2">
          <UserPlus className="h-4 w-4" />
          Leerling toevoegen
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-2xl overflow-y-auto sm:max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle>Leerling direct toevoegen</DialogTitle>
          <DialogDescription>
            Maak snel een leerlingprofiel aan. E-mail is optioneel; zonder
            e-mailadres blijft het dossier volledig bruikbaar en kan het portaal
            later veilig worden geactiveerd.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle className="h-12 w-12 text-success" />
            <p className="font-medium text-foreground">Leerling aangemaakt</p>
            {emailWarning ? (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-[color-mix(in_oklab,var(--warning,#f59e0b)_10%,transparent)] px-3 py-2 text-left text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{emailWarning}</span>
              </div>
            ) : email ? (
              <p className="text-sm text-muted-foreground">
                Er is een welkomstmail verstuurd naar <strong>{email}</strong>.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Het profiel is zonder portaalaccount aangemaakt. Voeg later een
                echt e-mailadres toe om een uitnodiging te versturen.
              </p>
            )}
            <Button
              variant="outline"
              onClick={() => handleOpen(false)}
              className="mt-2 min-h-11"
            >
              Sluiten
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-student-naam">
                Naam <span className="text-danger">*</span>
              </Label>
              <Input
                id="add-student-naam"
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                placeholder="Voor- en achternaam"
                required
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-student-email">
                E-mailadres{" "}
                <span className="font-normal text-muted-foreground">
                  (optioneel)
                </span>
              </Label>
              <Input
                id="add-student-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="naam@voorbeeld.nl"
                autoComplete="email"
                aria-describedby="add-student-email-help"
              />
              <p
                id="add-student-email-help"
                className="text-xs leading-5 text-muted-foreground"
              >
                Alleen invullen als dit het echte adres van de leerling is.
                Zonder e-mail maken we geen tijdelijk of fictief account aan.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="add-student-opleidingstype">
                  Opleidingstype <span className="text-danger">*</span>
                </Label>
                <Select
                  id="add-student-opleidingstype"
                  value={opleidingstype}
                  onChange={(event) =>
                    setOpleidingstype(
                      event.target.value as "STANDARD" | "RIS_2_0",
                    )
                  }
                  required
                >
                  <option value="STANDARD">Reguliere rijopleiding</option>
                  <option value="RIS_2_0" disabled={!ris20Qualified}>
                    RIS 2.0
                  </option>
                </Select>
                <p className="text-xs leading-5 text-muted-foreground">
                  {ris20Qualified
                    ? "RIS 2.0 is standaard geselecteerd omdat je hiervoor gekwalificeerd bent."
                    : "RIS 2.0 wordt beschikbaar zodra je kwalificatie actief is."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-student-startdatum">
                  Gewenste startdatum
                </Label>
                <Input
                  id="add-student-startdatum"
                  type="date"
                  value={startdatum}
                  onChange={(event) => setStartdatum(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-student-telefoon">Telefoon</Label>
                <Input
                  id="add-student-telefoon"
                  type="tel"
                  value={telefoon}
                  onChange={(e) => setTelefoon(e.target.value)}
                  placeholder="06 12345678"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-student-postcode">Postcode</Label>
                <Input
                  id="add-student-postcode"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  placeholder="1234 AB"
                  autoComplete="off"
                />
              </div>
            </div>

            <label
              htmlFor="add-student-privacy"
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm"
            >
              <input
                id="add-student-privacy"
                type="checkbox"
                checked={privacyConfirmed}
                onChange={(event) => setPrivacyConfirmed(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                required
              />
              <span>
                <span className="font-semibold text-foreground">
                  Privacyproces bevestigd
                </span>
                <span className="mt-0.5 block leading-5 text-muted-foreground">
                  Ik heb deze gegevens volgens het afgesproken tenantproces
                  ontvangen en leg alleen noodzakelijke informatie vast.
                </span>
              </span>
            </label>

            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="mb-3">
                <p className="text-sm font-semibold text-foreground">
                  NAW en planning
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Deze gegevens komen terug in de centrale leerlingcockpit.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="add-student-geboortedatum">
                    Geboortedatum
                  </Label>
                  <Input
                    id="add-student-geboortedatum"
                    type="date"
                    value={geboortedatum}
                    onChange={(e) => setGeboortedatum(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-student-woonplaats">Woonplaats</Label>
                  <Input
                    id="add-student-woonplaats"
                    value={woonplaats}
                    onChange={(e) => setWoonplaats(e.target.value)}
                    placeholder="Utrecht"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="add-student-adres">Adres</Label>
                  <Input
                    id="add-student-adres"
                    value={adres}
                    onChange={(e) => setAdres(e.target.value)}
                    placeholder="Straatnaam 12"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="add-student-ophaaladres">
                    Ophaaladres voor lessen
                  </Label>
                  <Input
                    id="add-student-ophaaladres"
                    value={ophaaladres}
                    onChange={(e) => setOphaaladres(e.target.value)}
                    placeholder="Laat leeg als dit gelijk is aan het adres"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-danger/30 bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] p-3 text-sm text-danger">
                {error}
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => handleOpen(false)}
                disabled={pending}
              >
                Annuleren
              </Button>
              <Button
                type="submit"
                className="min-h-11"
                disabled={pending || !naam.trim() || !privacyConfirmed}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Leerling aanmaken
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
