"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  StickyNote,
  TrendingUp,
  XCircle,
  UserX,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  completeLessonAction,
  cancelLessonAction,
  markNoShowAction,
  addLessonNoteAction,
  setLessonProgressAction,
} from "@/app/instructor/actions";

type Panel = "note" | "progress" | "cancel" | "no_show" | null;

export function InstructorActionsPanel({
  lessonId,
  isPlanned,
  refundPreview,
  hoursBefore,
  currentScore,
  currentSummary,
}: {
  lessonId: string;
  isPlanned: boolean;
  refundPreview: number;
  hoursBefore: number;
  currentScore: number | null;
  currentSummary: string | null;
}) {
  const [open, setOpen] = useState<Panel>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(p: Panel) {
    setError(null);
    setOpen((cur) => (cur === p ? null : p));
  }

  function submit(action: (fd: FormData) => Promise<{ error?: string } | void>) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      fd.set("lesson_id", lessonId);
      startTransition(async () => {
        const res = await action(fd);
        if (res && "error" in res && res.error) {
          setError(res.error);
        } else {
          setOpen(null);
          setError(null);
        }
      });
    };
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Acties
        </div>

        {isPlanned ? (
          <form
            action={completeLessonAction}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <input type="hidden" name="lesson_id" value={lessonId} />
            <Button
              type="submit"
              size="lg"
              className="flex-1"
              disabled={pending}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Markeer als voltooid
            </Button>
          </form>
        ) : (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Deze les is afgesloten — alleen notitie / voortgang nog mogelijk.
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ActionTile
            icon={StickyNote}
            label="Notitie"
            onClick={() => toggle("note")}
            active={open === "note"}
          />
          <ActionTile
            icon={TrendingUp}
            label="Voortgang"
            onClick={() => toggle("progress")}
            active={open === "progress"}
          />
          <ActionTile
            icon={UserX}
            label="No-show"
            onClick={() => toggle("no_show")}
            active={open === "no_show"}
            disabled={!isPlanned}
          />
          <ActionTile
            icon={XCircle}
            label="Annuleren"
            onClick={() => toggle("cancel")}
            active={open === "cancel"}
            disabled={!isPlanned}
          />
        </div>

        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        {open === "note" ? (
          <form onSubmit={submit(addLessonNoteAction)} className="space-y-2">
            <Label htmlFor="note-body">Notitie</Label>
            <Textarea
              id="note-body"
              name="body"
              rows={3}
              maxLength={4000}
              required
              placeholder="bv. Sturen in bochten gaat goed, parkeren oefenen volgende les"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(null)}
                disabled={pending}
              >
                Annuleren
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                Notitie opslaan
              </Button>
            </div>
          </form>
        ) : null}

        {open === "progress" ? (
          <form
            onSubmit={submit(setLessonProgressAction)}
            className="space-y-2"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="progress-score">Score (0–10)</Label>
                <Select
                  id="progress-score"
                  name="score"
                  defaultValue={currentScore?.toString() ?? ""}
                  required
                >
                  <option value="" disabled>
                    Kies…
                  </option>
                  {Array.from({ length: 11 }, (_, i) => (
                    <option key={i} value={i.toString()}>
                      {i}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <Label htmlFor="progress-summary">Toelichting</Label>
            <Textarea
              id="progress-summary"
              name="summary"
              rows={2}
              maxLength={2000}
              defaultValue={currentSummary ?? ""}
              placeholder="Optioneel — wat ging goed, wat moet beter"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(null)}
                disabled={pending}
              >
                Annuleren
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                Voortgang opslaan
              </Button>
            </div>
          </form>
        ) : null}

        {open === "no_show" && isPlanned ? (
          <form onSubmit={submit(markNoShowAction)} className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Markeert deze les als no-show. Geen refund. Deze actie kan niet
              ongedaan worden.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(null)}
                disabled={pending}
              >
                Annuleren
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                disabled={pending}
              >
                Registreer no-show
              </Button>
            </div>
          </form>
        ) : null}

        {open === "cancel" && isPlanned ? (
          <form onSubmit={submit(cancelLessonAction)} className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Annulering nu ({hoursBefore.toFixed(1)} u vooraf): refund{" "}
              <span className="font-medium text-foreground">
                {refundPreview} credit(s)
              </span>{" "}
              volgens beleid van deze rijschool.
            </p>
            <Label htmlFor="cancel-reason">Reden</Label>
            <Input
              id="cancel-reason"
              name="reason"
              maxLength={500}
              required
              placeholder="bv. Leerling ziek"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(null)}
                disabled={pending}
              >
                Niet annuleren
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                disabled={pending}
              >
                Bevestig annulering
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActionTile({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  onClick: () => void;
  active: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-muted/30 text-muted-foreground opacity-60"
          : active
            ? "border-primary bg-primary-soft text-primary"
            : "border-border bg-card text-foreground hover:border-muted-foreground/40 hover:bg-muted",
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span className="flex items-center gap-1">
        {label}
        {!disabled ? (
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              active && "rotate-180",
            )}
            aria-hidden
          />
        ) : null}
      </span>
    </button>
  );
}
