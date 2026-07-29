"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  CircleAlert,
  ListFilter,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  type TaskPriority,
} from "@/lib/tasks/types";
import {
  type InstructorTaskItem,
  type InstructorTaskStatus,
  type InstructorTaskWorkspace,
} from "@/lib/instructor/tasks";
import {
  completeInstructorTask,
  createInstructorTask,
  deleteInstructorTask,
  updateInstructorTask,
} from "@/app/instructeur/taken/actions";
import { cn } from "@/lib/utils";

type TaskFilter = "all" | InstructorTaskStatus;

const priorityVariant: Record<TaskPriority, BadgeProps["variant"]> = {
  low: "info",
  normal: "default",
  high: "warning",
  urgent: "danger",
};

const filterLabels: Record<TaskFilter, string> = {
  all: "Alle",
  open: "Later",
  today: "Vandaag",
  late: "Te laat",
};

export function InstructorTaskManager({
  workspace,
}: {
  workspace: InstructorTaskWorkspace;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [query, setQuery] = useState("");
  const [editingTask, setEditingTask] = useState<InstructorTaskItem | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const counts = useMemo(
    () => ({
      all: workspace.tasks.length,
      open: workspace.tasks.filter((task) => task.status === "open").length,
      today: workspace.tasks.filter((task) => task.status === "today").length,
      late: workspace.tasks.filter((task) => task.status === "late").length,
    }),
    [workspace.tasks],
  );
  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("nl-NL");
    return workspace.tasks.filter((task) => {
      if (filter !== "all" && task.status !== filter) return false;
      if (!normalizedQuery) return true;
      return [task.title, task.description, task.studentName]
        .filter(Boolean)
        .some((value) =>
          value!.toLocaleLowerCase("nl-NL").includes(normalizedQuery),
        );
    });
  }, [filter, query, workspace.tasks]);

  function mutateTask(
    taskId: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setError(null);
    setPendingTaskId(taskId);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Taakactie mislukt.");
      } else {
        router.refresh();
      }
      setPendingTaskId(null);
    });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(filterLabels) as TaskFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition",
                  filter === key
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-brand-border bg-white text-muted-foreground hover:border-primary/35 hover:text-foreground",
                )}
              >
                {filterLabels[key]}
                <span className="rounded-full bg-background px-1.5 py-0.5 text-xs tabular-nums">
                  {counts[key]}
                </span>
              </button>
            ))}
          </div>
          <Button
            type="button"
            className="min-h-11"
            onClick={() => {
              setError(null);
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Taak toevoegen
          </Button>
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-brand-border bg-white px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Zoek op taak of leerling..."
            aria-label="Taken zoeken"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <ListFilter className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </div>
        ) : null}

        {visibleTasks.length > 0 ? (
          <ul className="space-y-3">
            {visibleTasks.map((task) => {
              const pending = pendingTaskId === task.id;
              return (
                <li
                  key={task.id}
                  className={cn(
                    "grid gap-3 rounded-2xl border border-brand-border bg-white p-4 transition md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center",
                    task.status === "late" && "border-danger/30 bg-danger/5",
                    task.status === "today" && "border-warning/30 bg-warning/5",
                    pending && "opacity-60",
                  )}
                >
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      mutateTask(task.id, () => completeInstructorTask(task.id))
                    }
                    aria-label={`Markeer ${task.title} als afgerond`}
                    className="grid h-11 w-11 place-items-center rounded-xl border border-border text-muted-foreground transition hover:border-success hover:bg-success/10 hover:text-success disabled:cursor-not-allowed"
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="h-5 w-5" aria-hidden />
                    )}
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-foreground">{task.title}</p>
                      <Badge variant={priorityVariant[task.priority]}>
                        {TASK_PRIORITY_LABEL[task.priority]}
                      </Badge>
                      <TaskStatusBadge status={task.status} />
                    </div>
                    {task.description ? (
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {task.description}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                        {task.dueDate
                          ? formatDueDate(task.dueDate)
                          : "Geen einddatum"}
                      </span>
                      {task.studentId && task.studentName ? (
                        <Link
                          href={`/instructeur/leerlingen/${task.studentId}`}
                          className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
                        >
                          <UserRound className="h-3.5 w-3.5" aria-hidden />
                          {task.studentName}
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound className="h-3.5 w-3.5" aria-hidden />
                          Geen leerling gekoppeld
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={pending}
                      onClick={() => {
                        setError(null);
                        setEditingTask(task);
                      }}
                      aria-label={`Bewerk ${task.title}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Weet je zeker dat je "${task.title}" wilt verwijderen?`,
                          )
                        ) {
                          mutateTask(task.id, () =>
                            deleteInstructorTask(task.id),
                          );
                        }
                      }}
                      aria-label={`Verwijder ${task.title}`}
                      className="text-danger hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-brand-border bg-brand-muted/45 p-8 text-center">
            <p className="font-bold text-foreground">
              {workspace.tasks.length === 0
                ? "Geen openstaande taken"
                : "Geen taken gevonden"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {workspace.tasks.length === 0
                ? "Voeg een taak toe om een leerlingactie of reminder vast te leggen."
                : "Pas het filter of de zoekopdracht aan."}
            </p>
          </div>
        )}
      </div>

      <TaskFormDialog
        open={creating || editingTask !== null}
        task={editingTask}
        students={workspace.students}
        onClose={() => {
          setCreating(false);
          setEditingTask(null);
        }}
      />
    </>
  );
}

function TaskStatusBadge({ status }: { status: InstructorTaskStatus }) {
  if (status === "late") return <Badge variant="danger">Te laat</Badge>;
  if (status === "today") return <Badge variant="warning">Vandaag</Badge>;
  return null;
}

function TaskFormDialog({
  open,
  task,
  students,
  onClose,
}: {
  open: boolean;
  task: InstructorTaskItem | null;
  students: InstructorTaskWorkspace["students"];
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = task
        ? await updateInstructorTask(formData)
        : await createInstructorTask(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {task ? "Taak bewerken" : "Nieuwe taak toevoegen"}
          </DialogTitle>
          <DialogDescription>
            Leg een eigen actie vast en koppel deze optioneel aan een leerling.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="space-y-4">
          {task ? <input type="hidden" name="task_id" value={task.id} /> : null}

          <div className="space-y-1.5">
            <Label htmlFor="instructor-task-title">Titel</Label>
            <Input
              id="instructor-task-title"
              name="title"
              required
              maxLength={200}
              defaultValue={task?.title ?? ""}
              placeholder="Bijv. Volgende les parkeren oefenen"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="instructor-task-description">Omschrijving</Label>
            <Textarea
              id="instructor-task-description"
              name="description"
              maxLength={4000}
              rows={4}
              defaultValue={task?.description ?? ""}
              placeholder="Optionele details of aandachtspunten"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="instructor-task-priority">Prioriteit</Label>
              <Select
                id="instructor-task-priority"
                name="priority"
                defaultValue={task?.priority ?? "normal"}
              >
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {TASK_PRIORITY_LABEL[priority]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="instructor-task-due-date">Einddatum</Label>
              <Input
                id="instructor-task-due-date"
                name="due_date"
                type="date"
                defaultValue={task?.dueDate ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="instructor-task-student">Leerling koppelen</Label>
            <Select
              id="instructor-task-student"
              name="student_id"
              defaultValue={task?.studentId ?? ""}
            >
              <option value="">Geen leerling</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              Je ziet alleen leerlingen waaraan je via lessen of berichten bent
              gekoppeld.
            </p>
          </div>

          {error ? (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <DialogFooter className="flex-col-reverse sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
              className="min-h-11"
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={pending} className="min-h-11">
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              {task ? "Wijzigingen opslaan" : "Taak toevoegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatDueDate(date: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}
