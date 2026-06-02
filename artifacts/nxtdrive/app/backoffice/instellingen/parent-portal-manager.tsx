"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PARENT_PORTAL_VISIBILITY,
  PARENT_PORTAL_SECTIONS,
  PARENT_PORTAL_SECTION_DESCRIPTION,
  PARENT_PORTAL_SECTION_LABEL,
  type ParentPortalVisibility,
} from "@/lib/parent-portal/visibility";
import {
  saveParentPortalVisibility,
  resetParentPortalVisibility,
} from "./actions";

export function ParentPortalManager({
  visibility,
}: {
  visibility: ParentPortalVisibility;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [state, setState] = useState<ParentPortalVisibility>(visibility);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Er ging iets mis.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function onSave() {
    const fd = new FormData();
    for (const section of PARENT_PORTAL_SECTIONS) {
      fd.set(section, state[section] ? "true" : "false");
    }
    run(() => saveParentPortalVisibility(fd));
  }

  function onReset() {
    run(async () => {
      const res = await resetParentPortalVisibility();
      if (res.ok) setState({ ...DEFAULT_PARENT_PORTAL_VISIBILITY });
      return res;
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Het ouderportaal is een aparte, alleen-lezen omgeving waarin ouders de
        gegevens van hun gekoppelde kind(eren) kunnen volgen. Interne notities,
        documenten en online betalen zijn nooit zichtbaar. Bepaal hier welke
        onderdelen ouders te zien krijgen. Een uitgeschakeld onderdeel wordt
        niet getoond én niet geladen.
      </p>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Ouderportaal-instellingen opgeslagen.
        </p>
      ) : null}

      <ul className="divide-y divide-border rounded-md border border-border">
        {PARENT_PORTAL_SECTIONS.map((section) => (
          <li
            key={section}
            className="flex items-start justify-between gap-4 px-3 py-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                {PARENT_PORTAL_SECTION_LABEL[section]}
              </div>
              <div className="text-xs text-muted-foreground">
                {PARENT_PORTAL_SECTION_DESCRIPTION[section]}
              </div>
            </div>
            <label className="flex shrink-0 items-center gap-2">
              <input
                type="checkbox"
                checked={state[section]}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, [section]: e.target.checked }))
                }
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-xs text-muted-foreground">
                {state[section] ? "Zichtbaar" : "Verborgen"}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onSave}>
          Ouderportaal opslaan
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={onReset}
        >
          Terug naar standaard
        </Button>
      </div>
    </div>
  );
}
