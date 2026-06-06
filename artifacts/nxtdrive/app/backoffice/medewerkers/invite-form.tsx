"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { UserPlus } from "lucide-react";
import { inviteInstructor } from "./actions";
import type { Branch } from "@/lib/branches/service";

const ROLE_OPTIONS = [
  { value: "instructor", label: "Instructeur" },
  { value: "branch_manager", label: "Vestigingsmanager" },
  { value: "planner", label: "Planner" },
  { value: "admin_staff", label: "Administratie" },
  { value: "marketing", label: "Marketing" },
  { value: "tenant_admin", label: "Beheerder" },
];

const BRANCH_SCOPED_ROLES = new Set([
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "instructor",
]);

export function InviteForm({ branches }: { branches: Branch[] }) {
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("instructor");
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);

  const showBranchPicker =
    branches.length > 0 && BRANCH_SCOPED_ROLES.has(selectedRole);

  function toggleBranch(id: string) {
    setSelectedBranches((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id],
    );
  }

  return (
    <div>
      {!open ? (
        <Button onClick={() => setOpen(true)} size="sm">
          <UserPlus className="h-4 w-4" aria-hidden />
          Medewerker toevoegen
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Medewerker toevoegen</CardTitle>
            <p className="text-sm text-muted-foreground">
              Nieuwe medewerkers ontvangen automatisch een e-mail met een
              tijdelijk wachtwoord. Bij de eerste login moeten ze direct een
              eigen wachtwoord instellen.
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
                    value={selectedRole}
                    onChange={(e) => {
                      setSelectedRole(e.target.value);
                      setSelectedBranches([]);
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Branch multi-select for scoped roles */}
              {showBranchPicker ? (
                <div className="space-y-2">
                  <Label>
                    Vestigingen{" "}
                    <span className="text-muted-foreground font-normal">
                      (leeg = toegang tot alle vestigingen)
                    </span>
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {branches.map((b) => {
                      const checked = selectedBranches.includes(b.id);
                      return (
                        <label
                          key={b.id}
                          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-sm transition-colors hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            name="branch_ids[]"
                            value={b.id}
                            checked={checked}
                            onChange={() => toggleBranch(b.id)}
                            className="rounded"
                          />
                          {b.name}
                          {b.city ? (
                            <span className="text-muted-foreground text-xs">
                              ({b.city})
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Selecteer vestigingen om deze medewerker te beperken tot
                    die locaties. Geen selectie = toegang tot alle vestigingen.
                  </p>
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  Inloggegevens versturen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    setSelectedBranches([]);
                  }}
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
