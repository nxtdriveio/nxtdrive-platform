"use client";

import * as React from "react";
import { UserPlus, Loader2, CheckCircle } from "lucide-react";
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
import { PasswordField, getPasswordStrength } from "@/components/ui/password-field";
import { createStudentDirect } from "@/app/backoffice/leerlingen/actions";

export function AddStudentDialog() {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const [naam, setNaam] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [telefoon, setTelefoon] = React.useState("");
  const [postcode, setPostcode] = React.useState("");
  const [wachtwoord, setWachtwoord] = React.useState("");
  const [bevestig, setBevestig] = React.useState("");

  function reset() {
    setNaam("");
    setEmail("");
    setTelefoon("");
    setPostcode("");
    setWachtwoord("");
    setBevestig("");
    setError(null);
    setDone(false);
    setPending(false);
  }

  function handleOpen(val: boolean) {
    setOpen(val);
    if (!val) reset();
  }

  const strength = wachtwoord ? getPasswordStrength(wachtwoord) : null;
  const tooWeak = wachtwoord ? (strength?.score ?? 0) < 2 : false;
  const mismatch = bevestig.length > 0 && bevestig !== wachtwoord;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tooWeak || mismatch) return;

    setPending(true);
    setError(null);

    const fd = new FormData();
    fd.set("naam", naam);
    fd.set("email", email);
    fd.set("telefoon", telefoon);
    fd.set("postcode", postcode);
    fd.set("wachtwoord", wachtwoord);

    try {
      const result = await createStudentDirect(fd);
      if (result.ok) {
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

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leerling direct toevoegen</DialogTitle>
          <DialogDescription>
            Maak direct een leerlingaccount aan. De leerling ontvangt een
            welkomstmail met een tijdelijk wachtwoord en wordt bij de eerste
            login gevraagd dit te wijzigen.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle className="h-12 w-12 text-success" />
            <p className="font-medium text-foreground">Leerling aangemaakt</p>
            <p className="text-sm text-muted-foreground">
              Er is een welkomstmail verstuurd naar{" "}
              <strong>{email}</strong>.
            </p>
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

            <div className="border-t border-border pt-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Stel een tijdelijk wachtwoord in voor de leerling. De leerling
                wordt bij de eerste login gevraagd dit te wijzigen.
              </p>

              <PasswordField
                id="add-student-wachtwoord"
                name="wachtwoord"
                label="Tijdelijk wachtwoord *"
                value={wachtwoord}
                onChange={setWachtwoord}
                showStrength
                minScore={2}
                autoComplete="new-password"
                required
              />

              <PasswordField
                id="add-student-bevestig"
                name="bevestig"
                label="Bevestig wachtwoord *"
                value={bevestig}
                onChange={setBevestig}
                error={mismatch ? "Wachtwoorden komen niet overeen." : null}
                autoComplete="new-password"
                required
              />
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
                disabled={pending || tooWeak || mismatch || !naam || !email || !wachtwoord || !bevestig}
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
