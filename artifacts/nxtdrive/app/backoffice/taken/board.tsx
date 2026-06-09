"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, CalendarClock, User2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ReadOnlyScopeNotice } from "@/components/backoffice/branch-scope-ui";
import { cn } from "@/lib/utils";
import type { Branch } from "@/lib/branches/service";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_VARIANT,
  type ResolvedTaskLink,
  type Task,
  type TaskColumn,
  type TenantMember,
} from "@/lib/tasks/types";
import { moveTask } from "./actions";
import { TaskDialog } from "./task-dialog";

const dueFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
});

type BoardState = Record<string, Task[]>;
type BranchOption = Pick<Branch, "id" | "name">;

function groupByColumn(columns: TaskColumn[], tasks: Task[]): BoardState {
  const state: BoardState = {};
  for (const c of columns) state[c.id] = [];
  for (const t of tasks) {
    if (!state[t.column_id]) state[t.column_id] = [];
    state[t.column_id]!.push(t);
  }
  for (const id of Object.keys(state)) {
    state[id]!.sort((a, b) => a.position - b.position);
  }
  return state;
}

export function Board({
  boardId,
  columns,
  initialTasks,
  members,
  links,
  canCreate = true,
  canManage = true,
  branches = [],
  canUseSharedBranch = true,
  defaultBranchId = null,
  layout = "scroll",
}: {
  boardId: string;
  columns: TaskColumn[];
  initialTasks: Task[];
  members: TenantMember[];
  links?: Record<string, ResolvedTaskLink[]>;
  canCreate?: boolean;
  canManage?: boolean;
  branches?: BranchOption[];
  canUseSharedBranch?: boolean;
  defaultBranchId?: string | null;
  layout?: "scroll" | "grid";
}) {
  const router = useRouter();
  const [board, setBoard] = useState<BoardState>(() =>
    groupByColumn(columns, initialTasks),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const dragOrigin = useRef<string | null>(null);
  const boardSnapshot = useRef<BoardState | null>(null);
  const [, startTransition] = useTransition();

  // Reconcile local state with server data after board switches and after
  // server actions revalidate the route (create/edit/archive/move). Client
  // state survives App Router navigations, so without this the board would
  // show stale columns/cards.
  const serverSignature = useMemo(
    () =>
      JSON.stringify({
        cols: columns.map((c) => c.id),
        tasks: initialTasks.map((t) => [
          t.id,
          t.branch_id,
          t.column_id,
          t.position,
          t.title,
          t.description,
          t.priority,
          t.due_date,
          t.assignee_user_id,
        ]),
      }),
    [columns, initialTasks],
  );
  const syncedSignature = useRef(serverSignature);
  useEffect(() => {
    if (syncedSignature.current !== serverSignature) {
      syncedSignature.current = serverSignature;
      setBoard(groupByColumn(columns, initialTasks));
    }
  }, [serverSignature, columns, initialTasks]);

  // Dialog state: create (with columnId) or edit (with task).
  const [dialog, setDialog] = useState<
    | { mode: "create"; columnId: string }
    | { mode: "edit"; task: Task }
    | null
  >(null);

  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const member of members) {
      m.set(member.id, member.full_name ?? "Onbekend lid");
    }
    return m;
  }, [members]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function columnOf(taskId: string): string | undefined {
    return Object.keys(board).find((cid) =>
      board[cid]!.some((t) => t.id === taskId),
    );
  }

  function resolveColumn(overId: string): string | undefined {
    // `overId` is either a column id (droppable) or a task id.
    if (board[overId]) return overId;
    return columnOf(overId);
  }

  const activeTask = activeId
    ? Object.values(board)
        .flat()
        .find((t) => t.id === activeId) ?? null
    : null;

  function handleDragStart(e: DragStartEvent) {
    if (!canManage) return;
    const id = String(e.active.id);
    dragOrigin.current = columnOf(id) ?? null;
    boardSnapshot.current = board;
    setActiveId(id);
  }

  function handleDragOver(e: DragOverEvent) {
    if (!canManage) return;
    const { active, over } = e;
    if (!over) return;
    const activeColId = columnOf(String(active.id));
    const overColId = resolveColumn(String(over.id));
    if (!activeColId || !overColId || activeColId === overColId) return;

    setBoard((prev) => {
      const activeItems = prev[activeColId]!;
      const overItems = prev[overColId]!;
      const moving = activeItems.find((t) => t.id === active.id);
      if (!moving) return prev;
      const overIndex = overItems.findIndex((t) => t.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : overItems.length;
      return {
        ...prev,
        [activeColId]: activeItems.filter((t) => t.id !== active.id),
        [overColId]: [
          ...overItems.slice(0, insertAt),
          moving,
          ...overItems.slice(insertAt),
        ],
      };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!canManage) return;
    const { active, over } = e;
    const activeIdStr = String(active.id);
    const origin = dragOrigin.current;
    dragOrigin.current = null;
    setActiveId(null);
    if (!over) return;

    const overIdStr = String(over.id);
    const overColId = resolveColumn(overIdStr);
    if (!overColId) return;

    const items = board[overColId]!;
    const isColumnDrop = Boolean(board[overIdStr]);

    // `move_task`'s p_position is the index among the OTHER cards in the
    // destination column. Since the active card is the only one excluded, that
    // index equals the active card's final index within its column.
    let finalIndex: number;

    if (origin === overColId) {
      // Same-column reorder: handleDragOver leaves these untouched, so apply
      // the move here.
      const oldIndex = items.findIndex((t) => t.id === activeIdStr);
      let target = isColumnDrop
        ? items.length - 1
        : items.findIndex((t) => t.id === overIdStr);
      if (target < 0) target = items.length - 1;
      if (oldIndex < 0) return;
      finalIndex = target;
      if (oldIndex !== target) {
        setBoard((prev) => ({
          ...prev,
          [overColId]: arrayMove(prev[overColId]!, oldIndex, target),
        }));
      }
    } else {
      // Cross-column: handleDragOver already inserted the card at its visual
      // position; persist that index.
      const currentIndex = items.findIndex((t) => t.id === activeIdStr);
      finalIndex = currentIndex >= 0 ? currentIndex : Math.max(0, items.length - 1);
    }

    const position = Math.max(0, finalIndex);
    startTransition(async () => {
      const result = await moveTask({
        taskId: activeIdStr,
        columnId: overColId,
        position,
      });
      if (!result.ok) {
        setMoveError(result.error ?? "Verplaatsen mislukt.");
        // Restore the pre-drag order, then reconcile with server truth.
        if (boardSnapshot.current) setBoard(boardSnapshot.current);
        router.refresh();
      }
      boardSnapshot.current = null;
    });
  }

  return (
    <>
      {!canManage ? (
        <ReadOnlyScopeNotice className="mb-3" />
      ) : null}
      {moveError ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
          <span>{moveError}</span>
          <button
            type="button"
            onClick={() => setMoveError(null)}
            className="font-medium underline-offset-2 hover:underline"
          >
            Sluiten
          </button>
        </div>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div
          className={cn(
            layout === "grid"
              ? "grid gap-4 pb-2 md:grid-cols-2 2xl:grid-cols-4"
              : "flex gap-4 overflow-x-auto pb-4",
          )}
        >
          {columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              tasks={board[column.id] ?? []}
              memberMap={memberMap}
              canCreate={canCreate && canManage}
              canManage={canManage}
              layout={layout}
              onAddCard={() => setDialog({ mode: "create", columnId: column.id })}
              onCardClick={(task) => {
                if (canManage) setDialog({ mode: "edit", task });
              }}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <TaskCard task={activeTask} memberMap={memberMap} overlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {dialog && canManage ? (
        <TaskDialog
          boardId={boardId}
          members={members}
          mode={dialog.mode}
          columnId={dialog.mode === "create" ? dialog.columnId : undefined}
          task={dialog.mode === "edit" ? dialog.task : undefined}
          links={
            dialog.mode === "edit" ? (links?.[dialog.task.id] ?? []) : undefined
          }
          branches={branches}
          canUseSharedBranch={canUseSharedBranch}
          defaultBranchId={defaultBranchId}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

function Column({
  column,
  tasks,
  memberMap,
  canCreate,
  canManage,
  layout,
  onAddCard,
  onCardClick,
}: {
  column: TaskColumn;
  tasks: Task[];
  memberMap: Map<string, string>;
  canCreate: boolean;
  canManage: boolean;
  layout: "scroll" | "grid";
  onAddCard: () => void;
  onCardClick: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const overLimit =
    column.wip_limit != null && tasks.length > column.wip_limit;

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border bg-muted/30",
        layout === "grid" ? "min-w-0" : "w-72 shrink-0",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {column.name}
          </span>
          <span
            className={cn(
              "rounded-full px-1.5 text-xs",
              overLimit
                ? "bg-danger/15 text-danger"
                : "bg-muted text-muted-foreground",
            )}
          >
            {tasks.length}
            {column.wip_limit != null ? ` / ${column.wip_limit}` : ""}
          </span>
        </div>
      </div>

      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={cn(
            "flex-1 space-y-2 px-2 pb-2",
            isOver && canManage && "rounded-md bg-primary-soft/40",
          )}
          style={{ minHeight: 64 }}
        >
          {tasks.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Geen taken in deze kolom.
            </div>
          ) : null}
          {tasks.map((task) => (
            <SortableCard
              key={task.id}
              task={task}
              memberMap={memberMap}
              canManage={canManage}
              onClick={() => onCardClick(task)}
            />
          ))}
        </div>
      </SortableContext>

      {canCreate ? (
        <button
          type="button"
          onClick={onAddCard}
          className="m-2 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Nieuwe taak
        </button>
      ) : null}
    </div>
  );
}

function SortableCard({
  task,
  memberMap,
  canManage,
  onClick,
}: {
  task: Task;
  memberMap: Map<string, string>;
  canManage: boolean;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !canManage });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={canManage ? onClick : undefined}
    >
      <TaskCard task={task} memberMap={memberMap} canManage={canManage} />
    </div>
  );
}

function TaskCard({
  task,
  memberMap,
  overlay = false,
  canManage = true,
}: {
  task: Task;
  memberMap: Map<string, string>;
  overlay?: boolean;
  canManage?: boolean;
}) {
  const assigneeName = task.assignee_user_id
    ? memberMap.get(task.assignee_user_id) ?? "Onbekend lid"
    : null;

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary",
        canManage ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        overlay && "shadow-lg",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-foreground">
          {task.title}
        </p>
        <Badge variant={TASK_PRIORITY_VARIANT[task.priority]}>
          {TASK_PRIORITY_LABEL[task.priority]}
        </Badge>
      </div>

      {task.description ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {task.description}
        </p>
      ) : null}

      {(task.due_date || assigneeName) && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {task.due_date ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3 w-3" aria-hidden />
              {dueFmt.format(new Date(task.due_date))}
            </span>
          ) : null}
          {assigneeName ? (
            <span className="inline-flex items-center gap-1">
              <User2 className="h-3 w-3" aria-hidden />
              {assigneeName}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
