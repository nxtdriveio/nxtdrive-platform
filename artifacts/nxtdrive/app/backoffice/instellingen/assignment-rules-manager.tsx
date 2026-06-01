"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createAssignmentRule,
  updateAssignmentRule,
  deleteAssignmentRule,
} from "./actions";

export type RuleDepartment = { id: string; name: string };

export type AssignmentRule = {
  id: string;
  keyword: string;
  match_type: "contains" | "equals" | "starts_with";
  department_id: string;
  active: boolean;
  sort_order: number;
};

const MATCH_LABEL: Record<AssignmentRule["match_type"], string> = {
  contains: "Bevat",
  equals: "Is gelijk aan",
  starts_with: "Begint met",
};

export function AssignmentRulesManager({
  departments,
  rules,
}: {
  departments: RuleDepartment[];
  rules: AssignmentRule[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [matchType, setMatchType] =
    useState<AssignmentRule["match_type"]>("contains");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? "—";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Er ging iets mis.");
        return;
      }
      router.refresh();
    });
  }

  function onAdd() {
    if (!keyword.trim()) {
      setError("Trefwoord is verplicht.");
      return;
    }
    if (!departmentId) {
      setError("Kies een afdeling.");
      return;
    }
    const fd = new FormData();
    fd.set("keyword", keyword.trim());
    fd.set("match_type", matchType);
    fd.set("department_id", departmentId);
    run(async () => {
      const res = await createAssignmentRule(fd);
      if (res.ok) {
        setKeyword("");
        setMatchType("contains");
      }
      return res;
    });
  }

  function onToggle(rule: AssignmentRule) {
    const fd = new FormData();
    fd.set("rule_id", rule.id);
    fd.set("active", rule.active ? "false" : "true");
    run(() => updateAssignmentRule(fd));
  }

  function onDelete(rule: AssignmentRule) {
    const fd = new FormData();
    fd.set("rule_id", rule.id);
    run(() => deleteAssignmentRule(fd));
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-foreground">Afdelingen</p>
        <p className="mb-2 text-sm text-muted-foreground">
          Taken worden binnen je organisatie over deze afdelingen verdeeld.
        </p>
        <div className="flex flex-wrap gap-2">
          {departments.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              Geen afdelingen gevonden.
            </span>
          ) : (
            departments.map((d) => (
              <Badge key={d.id} variant="info">
                {d.name}
              </Badge>
            ))
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Toewijzingsregels
          </p>
          <p className="text-sm text-muted-foreground">
            Wanneer een nieuwe taak wordt aangemaakt zonder afdeling, bepaalt de
            eerste actieve regel waarvan het trefwoord op de titel past de
            afdeling. Past geen enkele regel, dan volgt de taak de afdeling van
            het bord.
          </p>
        </div>

        {error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen regels ingesteld.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 text-sm">
                  <span className="text-muted-foreground">
                    {MATCH_LABEL[rule.match_type]}
                  </span>{" "}
                  <span className="font-medium text-foreground">
                    “{rule.keyword}”
                  </span>{" "}
                  <span className="text-muted-foreground">→</span>{" "}
                  <span className="font-medium text-foreground">
                    {deptName(rule.department_id)}
                  </span>
                  {!rule.active ? (
                    <Badge variant="warning" className="ml-2">
                      Inactief
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onToggle(rule)}
                  >
                    {rule.active ? "Deactiveren" : "Activeren"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onDelete(rule)}
                  >
                    Verwijderen
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-md border border-dashed border-border p-3">
          <p className="mb-3 text-sm font-medium text-foreground">
            Nieuwe regel
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="rule_match_type">Voorwaarde</Label>
                <Select
                  id="rule_match_type"
                  value={matchType}
                  onChange={(e) =>
                    setMatchType(
                      e.target.value as AssignmentRule["match_type"],
                    )
                  }
                >
                  <option value="contains">Bevat</option>
                  <option value="equals">Is gelijk aan</option>
                  <option value="starts_with">Begint met</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule_keyword">Trefwoord</Label>
                <Input
                  id="rule_keyword"
                  value={keyword}
                  maxLength={120}
                  placeholder="bijv. CBR-machtiging"
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule_department">Afdeling</Label>
                <Select
                  id="rule_department"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={pending || departments.length === 0}
              onClick={onAdd}
            >
              Regel toevoegen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
