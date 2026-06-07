"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Trash2, Plus, Search, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  TASK_LINK_TYPES,
  TASK_LINK_TYPE_LABEL,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  type EntitySearchResult,
  type ResolvedTaskLink,
  type Task,
  type TaskLinkType,
  type TenantMember,
} from "@/lib/tasks/types";
import type { LaunchBoard } from "@/lib/tasks/launch-data";
import { taskLinkHref } from "@/lib/tasks/links";
import {
  archiveTask,
  createTask,
  linkTaskEntity,
  searchLinkEntities,
  unlinkTaskEntity,
  updateTask,
} from "./actions";

type BranchOption = { id: string; name: string };

export function TaskDialog({
  boardId,
  members,
  mode,
  columnId,
  task,
  links,
  boards,
  initialLink,
  branches = [],
  canUseSharedBranch = true,
  defaultBranchId = null,
  onClose,
}: {
  boardId: string;
  members: TenantMember[];
  mode: "create" | "edit";
  columnId?: string;
  task?: Task;
  links?: ResolvedTaskLink[];
  /** When provided (entity-page launcher), the user picks a board here. */
  boards?: LaunchBoard[];
  /** Pre-filled link applied right after task creation. */
  initialLink?: { entity_type: TaskLinkType; entity_id: string; label: string };
  branches?: BranchOption[];
  canUseSharedBranch?: boolean;
  defaultBranchId?: string | null;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Board picker for entity-page launches (no board context there).
  const [boardSel, setBoardSel] = useState(() => boards?.[0]?.id ?? boardId);
  const selBoard = boards?.find((b) => b.id === boardSel);
  const effBoardId = boards ? boardSel : boardId;
  const effColumnId = boards ? (selBoard?.firstColumnId ?? "") : (columnId ?? "");
  const branchDefaultValue =
    task?.branch_id ?? defaultBranchId ?? (!canUseSharedBranch ? (branches[0]?.id ?? null) : null) ?? "";

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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-3.5">
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
              <input type="hidden" name="board_id" value={effBoardId} />
              <input type="hidden" name="column_id" value={effColumnId} />
              {initialLink ? (
                <>
                  <input
                    type="hidden"
                    name="link_entity_type"
                    value={initialLink.entity_type}
                  />
                  <input
                    type="hidden"
                    name="link_entity_id"
                    value={initialLink.entity_id}
                  />
                </>
              ) : null}
            </>
          ) : (
            <input type="hidden" name="task_id" value={task?.id ?? ""} />
          )}

          {initialLink ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
              <Link2 className="h-3.5 w-3.5 text-primary" aria-hidden />
              <span className="text-muted-foreground">
                {TASK_LINK_TYPE_LABEL[initialLink.entity_type]}:
              </span>
              <span className="font-medium">{initialLink.label}</span>
            </div>
          ) : null}

          {mode === "create" && boards ? (
            <div className="space-y-1.5">
              <Label htmlFor="board_select">Bord</Label>
              <Select
                id="board_select"
                value={boardSel}
                onChange={(e) => setBoardSel(e.target.value)}
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

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
            <Label htmlFor="branch_id">Vestiging</Label>
            <Select
              id="branch_id"
              name="branch_id"
              defaultValue={branchDefaultValue}
            >
              <BranchOptions
                branches={branches}
                canUseSharedBranch={canUseSharedBranch}
                currentBranchId={task?.branch_id ?? null}
              />
            </Select>
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
                {isPending ? "Opslaan..." : "Opslaan"}
              </Button>
            </div>
          </div>
        </form>

        {mode === "edit" && task ? (
          <TaskLinksSection taskId={task.id} initialLinks={links ?? []} />
        ) : null}
      </div>
    </div>
  );
}

function BranchOptions({
  branches,
  canUseSharedBranch,
  currentBranchId,
}: {
  branches: BranchOption[];
  canUseSharedBranch: boolean;
  currentBranchId: string | null;
}) {
  const currentBranchIsVisible =
    !currentBranchId || branches.some((b) => b.id === currentBranchId);

  return (
    <>
      {canUseSharedBranch ? <option value="">Alle vestigingen</option> : null}
      {!currentBranchIsVisible && currentBranchId ? (
        <option value={currentBranchId}>Huidige vestiging</option>
      ) : null}
      {branches.map((branch) => (
        <option key={branch.id} value={branch.id}>
          {branch.name}
        </option>
      ))}
    </>
  );
}

function TaskLinksSection({
  taskId,
  initialLinks,
}: {
  taskId: string;
  initialLinks: ResolvedTaskLink[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<ResolvedTaskLink[]>(initialLinks);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<TaskLinkType>("student");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Debounced search whenever the add panel is open and type/query change.
  useEffect(() => {
    if (!adding) return;
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      const res = await searchLinkEntities(type, query);
      if (cancelled) return;
      setSearching(false);
      if (res.ok) setResults(res.results);
      else setLinkError(res.error ?? "Zoeken mislukt.");
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [adding, type, query]);

  async function add(result: EntitySearchResult) {
    setBusy(true);
    setLinkError(null);
    const res = await linkTaskEntity({
      taskId,
      entityType: type,
      entityId: result.id,
    });
    setBusy(false);
    if (!res.ok || !res.linkId) {
      setLinkError(res.error ?? "Koppelen mislukt.");
      return;
    }
    setItems((prev) => {
      if (prev.some((p) => p.id === res.linkId)) return prev;
      return [
        ...prev,
        {
          id: res.linkId!,
          task_id: taskId,
          entity_type: type,
          entity_id: result.id,
          label: result.label,
          href: taskLinkHref(type, result.id),
        },
      ];
    });
    setQuery("");
    setAdding(false);
    router.refresh();
  }

  async function remove(linkId: string) {
    setBusy(true);
    setLinkError(null);
    const res = await unlinkTaskEntity({ linkId });
    setBusy(false);
    if (!res.ok) {
      setLinkError(res.error ?? "Ontkoppelen mislukt.");
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== linkId));
    router.refresh();
  }

  return (
    <div className="border-t border-border px-5 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Koppelingen
        </h3>
        {!adding ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setAdding(true);
              setResults([]);
            }}
            disabled={busy}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Koppelen
          </Button>
        ) : null}
      </div>

      {items.length === 0 && !adding ? (
        <p className="text-xs text-muted-foreground">
          Nog geen gekoppelde leerlingen, facturen, lessen of leads.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((link) => (
            <li
              key={link.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {TASK_LINK_TYPE_LABEL[link.entity_type]}
                </span>
                {link.href ? (
                  <Link
                    href={link.href}
                    className="inline-flex items-center gap-1 truncate font-medium text-foreground hover:text-primary hover:underline"
                  >
                    <span className="truncate">{link.label}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                  </Link>
                ) : (
                  <span className="truncate font-medium text-foreground">
                    {link.label}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => remove(link.id)}
                disabled={busy}
                className="shrink-0 text-muted-foreground transition-colors hover:text-danger disabled:opacity-50"
                aria-label="Koppeling verwijderen"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <div className="mt-3 space-y-2 rounded-md border border-border p-3">
          <div className="flex gap-2">
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value as TaskLinkType);
                setResults([]);
              }}
              className="w-36 shrink-0"
            >
              {TASK_LINK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TASK_LINK_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoeken..."
                className="pl-8"
              />
            </div>
          </div>

          <div className="max-h-44 overflow-y-auto rounded-md border border-border">
            {searching ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Zoeken...</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Geen resultaten.
              </p>
            ) : (
              <ul>
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => add(r)}
                      disabled={busy}
                      className="block w-full truncate px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(false);
                setQuery("");
              }}
              disabled={busy}
            >
              Sluiten
            </Button>
          </div>
        </div>
      ) : null}

      {linkError ? (
        <p className="mt-2 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
          {linkError}
        </p>
      ) : null}
    </div>
  );
}
