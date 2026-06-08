"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserPlus } from "lucide-react";
import { inviteInstructor } from "./actions";
import type { Branch } from "@/lib/branches/service";
import {
  governanceRoles,
  isBranchScopedGovernanceRole,
  roleGovernanceDefinition,
  type StaffGovernanceRole,
} from "@/lib/organization/roles";

type TeamOption = {
  id: string;
  name: string;
  branch_id: string | null;
  color: string;
  is_active: boolean;
};

const ROLE_OPTIONS = governanceRoles().map((role) => ({
  value: role,
  label: roleGovernanceDefinition(role).short_label,
}));

export function InviteForm({
  branches,
  teams,
}: {
  branches: Branch[];
  teams: TeamOption[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<StaffGovernanceRole>("instructor");
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);

  const showBranchPicker =
    branches.length > 0 && isBranchScopedGovernanceRole(selectedRole);
  const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const roleDefinition = roleGovernanceDefinition(selectedRole);

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
                      setSelectedRole(e.target.value as StaffGovernanceRole);
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

              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="primary">{roleDefinition.label}</Badge>
                  <Badge variant="outline">
                    {roleDefinition.scope_policy === "branch"
                      ? "Vestiging-scoped"
                      : "Organisatiebreed"}
                  </Badge>
                </div>
                <p className="mt-2 text-foreground">{roleDefinition.description}</p>
                <p className="mt-2 text-muted-foreground">{roleDefinition.intended_use}</p>
                <p className="mt-2 text-xs text-muted-foreground">{roleDefinition.governance_note}</p>
              </div>

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

              {teams.length > 0 ? (
                <div className="space-y-2">
                  <Label>
                    Teams{" "}
                    <span className="text-muted-foreground font-normal">
                      (optioneel)
                    </span>
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {teams.map((team) => {
                      const branchLabel = team.branch_id
                        ? branchNameById.get(team.branch_id) ?? "Vestiging onbekend"
                        : "Organisatiebreed";
                      return (
                        <label
                          key={team.id}
                          className="flex cursor-pointer items-start gap-2 rounded-md border border-input px-3 py-2 text-sm transition-colors hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            name="team_ids[]"
                            value={team.id}
                            className="mt-0.5 rounded"
                          />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="flex items-center gap-2 font-medium text-foreground">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: team.color }}
                                aria-hidden
                              />
                              {team.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {branchLabel}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Teams zijn operationeel. Rollen en vestigingstoegang blijven
                    voorlopig leidend voor rechten.
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
