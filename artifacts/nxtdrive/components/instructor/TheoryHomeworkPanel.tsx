"use client";

import { useState, useTransition } from "react";
import { BookOpen, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  assignTheoryHomeworkAction,
  setTheoryHomeworkStatusAction,
} from "@/app/instructor/actions";
import {
  THEORY_HOMEWORK_STATUS_LABEL,
  THEORY_HOMEWORK_STATUS_VARIANT,
  type TheoryModule,
  type TheoryHomeworkWithModule,
} from "@/lib/theory/types";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function TheoryHomeworkPanel({
  lessonId,
  modules,
  homework,
}: {
  lessonId: string;
  modules: TheoryModule[];
  homework: TheoryHomeworkWithModule[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(
    action: (fd: FormData) => Promise<{ error?: string }>,
    fd: FormData,
    onOk?: () => void,
  ) {
    fd.set("lesson_id", lessonId);
    setError(null);
    startTransition(async () => {
      const res = await action(fd);
      if (res?.error) setError(res.error);
      else onOk?.();
    });
  }

  function onAssign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    run(assignTheoryHomeworkAction, new FormData(form), () => form.reset());
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
          <BookOpen className="h-4 w-4" aria-hidden /> Theoriehuiswerk
        </div>

        {modules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Er zijn nog geen theoriemodules ingericht. Voeg ze toe via
            Backoffice → Theorie.
          </p>
        ) : (
          <form onSubmit={onAssign} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hw-module">Module</Label>
                <Select id="hw-module" name="module_id" defaultValue="" required>
                  <option value="" disabled>
                    Kies module…
                  </option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hw-deadline">Deadline (optioneel)</Label>
                <Input id="hw-deadline" name="deadline" type="date" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hw-note">Notitie (optioneel)</Label>
              <Input
                id="hw-note"
                name="note"
                maxLength={1000}
                placeholder="bv. Hoofdstuk 3 doornemen"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={pending}>
                Huiswerk toewijzen
              </Button>
            </div>
          </form>
        )}

        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        {homework.length > 0 ? (
          <ol className="space-y-2 border-t border-border pt-3">
            {homework.map((hw) => (
              <li
                key={hw.id}
                className="rounded-md border border-border bg-card/50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">
                      {hw.moduleTitle}
                    </div>
                    {hw.deadline ? (
                      <div className="text-xs text-muted-foreground">
                        Deadline: {dateFmt.format(new Date(hw.deadline))}
                      </div>
                    ) : null}
                    {hw.note ? (
                      <p className="text-xs text-muted-foreground">{hw.note}</p>
                    ) : null}
                  </div>
                  <Badge variant={THEORY_HOMEWORK_STATUS_VARIANT[hw.status]}>
                    {THEORY_HOMEWORK_STATUS_LABEL[hw.status]}
                  </Badge>
                </div>
                {hw.status !== "cancelled" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {hw.status !== "done" ? (
                      <StatusButton
                        homeworkId={hw.id}
                        status="done"
                        icon={CheckCircle2}
                        label="Afgerond"
                        disabled={pending}
                        onRun={run}
                      />
                    ) : (
                      <StatusButton
                        homeworkId={hw.id}
                        status="open"
                        icon={RotateCcw}
                        label="Heropenen"
                        disabled={pending}
                        onRun={run}
                      />
                    )}
                    <StatusButton
                      homeworkId={hw.id}
                      status="cancelled"
                      icon={XCircle}
                      label="Annuleren"
                      variant="ghost"
                      disabled={pending}
                      onRun={run}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusButton({
  homeworkId,
  status,
  icon: Icon,
  label,
  variant = "outline",
  disabled,
  onRun,
}: {
  homeworkId: string;
  status: "open" | "done" | "cancelled";
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  variant?: "outline" | "ghost";
  disabled?: boolean;
  onRun: (
    action: (fd: FormData) => Promise<{ error?: string }>,
    fd: FormData,
  ) => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={disabled}
      onClick={() => {
        const fd = new FormData();
        fd.set("homework_id", homeworkId);
        fd.set("status", status);
        onRun(setTheoryHomeworkStatusAction, fd);
      }}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </Button>
  );
}
