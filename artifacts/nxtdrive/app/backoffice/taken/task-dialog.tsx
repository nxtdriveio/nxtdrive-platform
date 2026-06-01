"use client";

import { useRef, useState, useTransition } from "react";
import { X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  type Task,
  type TenantMember,
} from "@/lib/tasks/types";
import { archiveTask, createTask, updateTask } from "./actions";

export function TaskDialog({
  boardId,
  members,
  mode,
  columnId,
  task,
  onClose,
}: {
  boardId: string;
  members: TenantMember[];
  mode: "create" | "edit";
  columnId?: string;
  task?: Task;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create" ? await createTask(formData) : await updateTask(formData);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error ?? "Opslaan mislukt.");
      }
    });
  }

  function onArchive() {
    if (!task) return;
    setError(null);
    const fd = new FormData();
    fd.set("task_id", task.id);
    startTransition(async () => {
      const result = await archiveTask(fd);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error ?? "Archiveren mislukt.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">
            {mode === "create" ? "Nieuwe taak" : "Taak bewerken"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Sluiten"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form ref={formRef} action={submit} className="space-y-4 px-5 py-4">
          {mode === "create" ? (
            <>
              <input type="hidden" name="board_id" value={boardId} />
              <input type="hidden" name="column_id" value={columnId ?? ""} />
            </>
          ) : (
            <input type="hidden" name="task_id" value={task?.id ?? ""} />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="title">Titel</Label>
            <Input
              id="title"
              name="title"
              required
              maxLength={200}
              defaultValue={task?.title ?? ""}
              placeholder="Bijv. Controleer CBR-machtiging"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Omschrijving</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              maxLength={4000}
              defaultValue={task?.description ?? ""}
              placeholder="Optionele details"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="priority">Prioriteit</Label>
              <Select
                id="priority"
                name="priority"
                defaultValue={task?.priority ?? "normal"}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="due_date">Einddatum</Label>
              <Input
                id="due_date"
                name="due_date"
                type="date"
                defaultValue={task?.due_date ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assignee_user_id">Toegewezen aan</Label>
            <Select
              id="assignee_user_id"
              name="assignee_user_id"
              defaultValue={task?.assignee_user_id ?? ""}
            >
              <option value="">Niemand</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name ?? "Onbekend lid"}
                </option>
              ))}
            </Select>
          </div>

          {error ? (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 pt-1">
            {mode === "edit" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onArchive}
                disabled={isPending}
                className="text-danger hover:bg-danger/10"
              >
                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
                Archiveren
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={isPending}
              >
                Annuleren
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? "Opslaan…" : "Opslaan"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
