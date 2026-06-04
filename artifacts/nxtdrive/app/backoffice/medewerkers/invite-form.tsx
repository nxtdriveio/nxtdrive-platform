"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { UserPlus } from "lucide-react";
import { inviteInstructor } from "./actions";

export function InviteForm() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      {!open ? (
        <Button onClick={() => setOpen(true)} size="sm">
          <UserPlus className="h-4 w-4" aria-hidden />
          Instructeur uitnodigen
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Medewerker uitnodigen</CardTitle>
            <p className="text-sm text-muted-foreground">
              De uitgenodigde persoon ontvangt een e-mail om een wachtwoord in
              te stellen en krijgt direct toegang tot de geselecteerde omgeving.
            </p>
          </CardHeader>
          <CardContent>
            <form action={inviteInstructor} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="full_name">Naam</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    type="text"
                    placeholder="Jan de Vries"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">
                    E-mailadres <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="jan@rijschool.nl"
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">
                    Rol <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="role"
                    name="role"
                    required
                    defaultValue="instructor"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="instructor">Instructeur</option>
                    <option value="tenant_admin">Beheerder</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  Uitnodiging versturen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Annuleren
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
