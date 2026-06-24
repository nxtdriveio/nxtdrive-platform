"use client";

import * as React from "react";
import { UserPlus, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
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

export function AddStudentDialog() {
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

  function reset() {
    setNaam("");
    setEmail("");
    setTelefoon("");
    setPostcode("");
    setGeboortedatum("");
    setAdres("");
    setWoonplaats("");
    setOphaaladres("");
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

    try {
      const result = await createStudentDirect(fd);
      if (result.ok) {
        setEmailWarning(result.emailWarning ?? null);
        setDone(true);
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
        <Button size="md" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Leerling toevoegen
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Leerling direct toevoegen</DialogTitle>
          <DialogDescription>
            Maak direct een leerlingaccount aan. De leerling ontvangt
            automatisch een welkomstmail met tijdelijke inloggegevens en wordt
            bij de eerste login gevraagd een nieuw wachtwoord in te stellen.
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
            ) : (
              <p className="text-sm text-muted-foreground">
                Er is een welkomstmail verstuurd naar{" "}
                <strong>{email}</strong>.
              </p>
            )}
            <Button
              variant="outline"
              onClick={() => handleOpen(false)}
              className="mt-2"
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
                E-mailadres <span className="text-danger">*</span>
              </Label>
              <Input
                id="add-student-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="naam@voorbeeld.nl"
                required
                autoComplete="off"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                onClick={() => handleOpen(false)}
                disabled={pending}
              >
                Annuleren
              </Button>
              <Button
                type="submit"
                disabled={pending || !naam || !email}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Leerling aanmaken
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
