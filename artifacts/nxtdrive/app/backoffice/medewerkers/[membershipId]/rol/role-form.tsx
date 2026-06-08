"use client";

import { useState } from "react";
import { GovernanceAlerts } from "@/components/organization/governance-alerts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  governanceRoles,
  roleGovernanceAlerts,
  roleGovernanceDefinition,
  roleScopeLabel,
  type StaffGovernanceRole,
} from "@/lib/organization/roles";
import { changeRole } from "../../actions";

const ROLE_OPTIONS = governanceRoles().map((role) => ({
  value: role,
  label: roleGovernanceDefinition(role).label,
}));

export function RoleManagementForm({
  membershipId,
  currentRole,
  selectedBranchCount,
  availableBranchCount,
  selectedTeamCount,
}: {
  membershipId: string;
  currentRole: StaffGovernanceRole;
  selectedBranchCount: number;
  availableBranchCount: number;
  selectedTeamCount: number;
}) {
  const [selectedRole, setSelectedRole] = useState<StaffGovernanceRole>(currentRole);

  const roleDefinition = roleGovernanceDefinition(selectedRole);
  const governanceAlerts = roleGovernanceAlerts(selectedRole, {
    selectedBranchCount,
    availableBranchCount,
    selectedTeamCount,
    includeTeamHint: true,
  });
  const roleChanged = selectedRole !== currentRole;

  return (
    <form action={changeRole} className="space-y-4">
      <input type="hidden" name="membership_id" value={membershipId} />
      <input
        type="hidden"
        name="return_to"
        value={`/backoffice/medewerkers/${membershipId}/rol`}
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:items-start">
        <label className="space-y-1.5 text-sm text-muted-foreground">
          <span>Nieuwe basisrol</span>
          <select
            name="role"
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value as StaffGovernanceRole)}
            className="flex h-10 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">{roleDefinition.label}</Badge>
            <Badge variant="outline">{roleScopeLabel(roleDefinition.role)}</Badge>
            {roleChanged ? <Badge variant="outline">Nieuwe keuze</Badge> : null}
          </div>
          <p className="mt-3 text-foreground">{roleDefinition.description}</p>
          <p className="mt-2 text-muted-foreground">{roleDefinition.intended_use}</p>
          <p className="mt-2 text-xs text-muted-foreground">{roleDefinition.governance_note}</p>
        </div>
      </div>

      <GovernanceAlerts alerts={governanceAlerts} />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm">
          Rol opslaan
        </Button>
        <a
          href={`/backoffice/medewerkers/${membershipId}/toegang`}
          className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Annuleren
        </a>
      </div>
    </form>
  );
}
