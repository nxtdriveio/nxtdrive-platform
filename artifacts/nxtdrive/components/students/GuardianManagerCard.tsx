"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { StudentGuardianView } from "@/lib/students/dossier";
import {
  addGuardian,
  removeGuardian,
  type GuardianActionResult,
} from "@/app/backoffice/leerlingen/actions";

export function GuardianManagerCard({
  studentId,
  guardians,
}: {
  studentId: string;
  guardians: StudentGuardianView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState("");

  function run(
    fn: () => Promise<GuardianActionResult>,
    successMessage: string,
    onSuccess?: () => void,
  ) {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Er ging iets mis.");
        return;
      }
      setSaved(successMessage);
      onSuccess?.();
      router.refresh();
    });
  }

  function onAdd() {
    const fd = new FormData();
    fd.set("student_id", studentId);
    fd.set("email", email);
    fd.set("relation", relation);
    run(() => addGuardian(fd), "Ouder gekoppeld.", () => {
      setEmail("");
      setRelation("");
    });
  }

  function onRemove(guardianId: string) {
    const fd = new FormData();
    fd.set("guardian_id", guardianId);
    fd.set("student_id", studentId);
    run(() => removeGuardian(fd), "Koppeling verwijderd.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ouders / verzorgers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {saved}
          </p>
        ) : null}

        {guardians.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen ouders of verzorgers gekoppeld.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {guardians.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {g.full_name ?? "Onbekende naam"}
                    {g.relation ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {g.relation}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {g.email ?? "—"}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => onRemove(g.id)}
                >
                  Verwijderen
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Ouder koppelen
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="guardian_email">E-mailadres</Label>
              <Input
                id="guardian_email"
                type="email"
                autoComplete="off"
                placeholder="ouder@voorbeeld.nl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guardian_relation">Relatie (optioneel)</Label>
              <Input
                id="guardian_relation"
                type="text"
                placeholder="Bijv. moeder, vader, voogd"
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
              />
            </div>
          </div>
          <Button type="button" size="sm" disabled={pending} onClick={onAdd}>
            Ouder koppelen
          </Button>
          <p className="text-xs text-muted-foreground">
            De ouder krijgt toegang tot het alleen-lezen ouderportaal voor deze
            leerling. Nieuwe ouders stellen hun wachtwoord in via
            &ldquo;wachtwoord vergeten&rdquo; op de inlogpagina.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
