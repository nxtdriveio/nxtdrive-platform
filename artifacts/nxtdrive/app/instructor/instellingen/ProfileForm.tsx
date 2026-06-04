"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateInstructorProfile } from "./actions";

export function ProfileForm({ initialName }: { initialName: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditing(true);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancel() {
    setName(initialName);
    setEditing(false);
    setError(null);
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Naam mag niet leeg zijn.");
      return;
    }
    const fd = new FormData();
    fd.set("full_name", trimmed);
    startTransition(async () => {
      const result = await updateInstructorProfile(fd);
      if (result.error) {
        setError(result.error);
      } else {
        setEditing(false);
        setError(null);
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">Naam</dt>
      <dd className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancel();
              }}
              disabled={pending}
              maxLength={100}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={save}
              disabled={pending}
              aria-label="Opslaan"
              className="h-7 w-7 shrink-0"
            >
              <Check className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={cancel}
              disabled={pending}
              aria-label="Annuleren"
              className="h-7 w-7 shrink-0"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <span className="truncate text-right font-medium text-foreground">{name}</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={startEdit}
              aria-label="Naam bewerken"
              className="h-7 w-7 shrink-0"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        )}
        {error && (
          <p className="mt-1 text-xs text-danger">{error}</p>
        )}
      </dd>
    </div>
  );
}
