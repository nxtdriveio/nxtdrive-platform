"use client";

import { useState, useTransition } from "react";
import { Car, MapPin, ListChecks, ChevronDown, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { setLessonContextAction } from "@/app/instructor/actions";
import {
  VEHICLE_TRANSMISSION_LABEL,
  type Vehicle,
  type Location,
  type LessonContext,
} from "@/lib/lessons/types";
import type { InstructorLeskaart } from "@/lib/skills/leskaart-data";

export function LessonContextPanel({
  lessonId,
  vehicles,
  locations,
  leskaart,
  context,
}: {
  lessonId: string;
  vehicles: Vehicle[];
  locations: Location[];
  leskaart: InstructorLeskaart;
  context: LessonContext;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(context.topicSkillIds),
  );

  function toggleSkill(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("lesson_id", lessonId);
    for (const id of selected) fd.append("topic_skill_ids", id);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setLessonContextAction(fd);
      if (res?.error) setError(res.error);
      else setSaved(true);
    });
  }

  const vehicleLabel = (v: Vehicle) =>
    [
      v.label,
      v.license_plate ? `(${v.license_plate})` : null,
      v.transmission ? `· ${VEHICLE_TRANSMISSION_LABEL[v.transmission]}` : null,
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Lescontext
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ctx-vehicle">
                <span className="inline-flex items-center gap-1.5">
                  <Car className="h-3.5 w-3.5" aria-hidden /> Voertuig
                </span>
              </Label>
              <Select
                id="ctx-vehicle"
                name="vehicle_id"
                defaultValue={context.vehicleId ?? ""}
              >
                <option value="">— Geen —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleLabel(v)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ctx-location">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" aria-hidden /> Locatie
                </span>
              </Label>
              <Select
                id="ctx-location"
                name="location_id"
                defaultValue={context.locationId ?? ""}
              >
                <option value="">— Geen —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <TopicPicker
            leskaart={leskaart}
            selected={selected}
            onToggle={toggleSkill}
          />

          <div className="space-y-1.5">
            <Label htmlFor="ctx-student-note">Leerlingnotitie (zichtbaar voor leerling)</Label>
            <Textarea
              id="ctx-student-note"
              name="student_note"
              rows={2}
              maxLength={4000}
              defaultValue={context.studentNote ?? ""}
              placeholder="bv. Goed gewerkt aan invoegen op de snelweg"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ctx-attention">Aandachtspunten (zichtbaar voor leerling)</Label>
            <Textarea
              id="ctx-attention"
              name="attention_points"
              rows={2}
              maxLength={4000}
              defaultValue={context.attentionPoints ?? ""}
              placeholder="bv. Spiegelgebruik bij wisselen van rijbaan"
            />
          </div>

          <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary-soft/30 p-3">
            <Label htmlFor="ctx-advice">
              <span className="inline-flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-primary" aria-hidden />
                Advies voor volgende les (zichtbaar voor leerling)
              </span>
            </Label>
            <Textarea
              id="ctx-advice"
              name="advice"
              rows={2}
              maxLength={4000}
              defaultValue={context.advice ?? ""}
              placeholder="bv. Oefen thuis de theorie over voorrang en focus volgende les op rotondes"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ctx-internal">
              Interne notitie (alleen voor rijschool)
            </Label>
            <Textarea
              id="ctx-internal"
              name="internal_note"
              rows={2}
              maxLength={4000}
              defaultValue={context.internalNote ?? ""}
              placeholder="Niet zichtbaar voor de leerling"
            />
          </div>

          {error ? (
            <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          ) : null}
          {saved && !error ? (
            <div className="rounded-md border border-success/40 bg-success/5 px-3 py-2 text-xs text-success">
              Lescontext opgeslagen.
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              Lescontext opslaan
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TopicPicker({
  leskaart,
  selected,
  onToggle,
}: {
  leskaart: InstructorLeskaart;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
      >
        <span className="inline-flex items-center gap-1.5">
          <ListChecks className="h-4 w-4" aria-hidden /> Behandelde onderdelen
          {selected.size > 0 ? (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">
              {selected.size}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-border p-3">
          {leskaart.categories.map((cat) => (
            <div key={cat.id} className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {cat.label}
              </div>
              {cat.subcategories.map((sub) => (
                <div key={sub.id} className="space-y-1 pl-1">
                  <div className="text-xs text-muted-foreground">{sub.label}</div>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {sub.leaves.map((leaf) => (
                      <label
                        key={leaf.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(leaf.id)}
                          onChange={() => onToggle(leaf.id)}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span className="text-foreground">{leaf.label}</span>
                        {leaf.isCritical ? (
                          <span className="text-xs text-danger">kritiek</span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
