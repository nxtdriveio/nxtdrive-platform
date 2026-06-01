"use client";

import { useState, useTransition } from "react";
import { Link2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setTheoryModuleSkillsAction } from "@/app/backoffice/theorie/actions";

export type SkillPickerGroup = {
  id: string;
  label: string;
  subgroups: {
    id: string;
    label: string;
    leaves: { id: string; label: string }[];
  }[];
};

export function TheoryModuleSkillsEditor({
  moduleId,
  groups,
  initialSkillIds,
}: {
  moduleId: string;
  groups: SkillPickerGroup[];
  initialSkillIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSkillIds),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggle(id: string) {
    setSaved(false);
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    const fd = new FormData();
    fd.set("module_id", moduleId);
    for (const id of selected) fd.append("skill_ids", id);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setTheoryModuleSkillsAction(fd);
      if (res?.error) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <Link2 className="h-3.5 w-3.5" aria-hidden />
        Gekoppelde vaardigheden ({selected.size})
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="max-h-72 space-y-3 overflow-y-auto">
            {groups.map((g) => (
              <div key={g.id} className="space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </div>
                {g.subgroups.map((sg) => (
                  <div key={sg.id} className="space-y-1 pl-1">
                    <div className="text-xs text-muted-foreground">{sg.label}</div>
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {sg.leaves.map((leaf) => (
                        <label
                          key={leaf.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(leaf.id)}
                            onChange={() => toggle(leaf.id)}
                            className="h-4 w-4 rounded border-border"
                          />
                          <span className="text-foreground">{leaf.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {error ? (
            <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          ) : null}
          {saved && !error ? (
            <div className="rounded-md border border-success/40 bg-success/5 px-3 py-2 text-xs text-success">
              Koppelingen opgeslagen.
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              Koppelingen opslaan
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
