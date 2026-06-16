"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  AlertCircle,
  Car,
  CheckCircle2,
  Clock3,
  GripVertical,
} from "lucide-react";

import {
  amsterdamMinuteOfDay,
  amsterdamWeekdayIndex,
  amsterdamYmd,
  createNlDateTimeFormatter,
  parseAmsterdamDateTime,
  startOfAmsterdamDayUtc,
} from "@/lib/datetime";
import {
  planningBoardEventLabel,
  planningBoardEventTone,
  type PlanningBoardAvailability,
  type PlanningBoardData,
  type PlanningBoardEvent,
} from "@/lib/planning-board";
import type { PlanningQueueListItem } from "@/lib/planning-queue";
import type { PlanningValidationResult } from "@/lib/planning-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  previewAppointmentMoveAction,
  previewQueueDropAction,
  rescheduleBoardAppointmentAction,
  scheduleQueueDropAction,
} from "./actions";

const START_HOUR = 7;
const END_HOUR = 21;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 34;
const dateShortFormatter = createNlDateTimeFormatter({
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const EVENT_LEGEND = [
  { key: "lesson", label: "Rijles", className: "bg-blue-500" },
  { key: "trial_lesson", label: "Proefles", className: "bg-emerald-500" },
  { key: "interim_test", label: "TTT", className: "bg-orange-500" },
  { key: "exam", label: "Examen", className: "bg-red-500" },
  { key: "admin", label: "Administratie", className: "bg-slate-500" },
  { key: "theory_guidance", label: "Theorie", className: "bg-pink-500" },
  { key: "block", label: "Prive/pauze/blok", className: "bg-zinc-700" },
] as const;

type DragPayload =
  | { kind: "queue"; id: string }
  | { kind: "appointment"; id: string };

type SlotTarget = {
  instructorId: string;
  day: string;
  startsAt: string;
};

function timeLabel(slot: number): string {
  const minutes = START_HOUR * 60 + slot * SLOT_MINUTES;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function localSlotIso(day: string, slot: number): string {
  return `${day}T${timeLabel(slot)}:00`;
}

function columnKey(day: string, instructorId: string): string {
  return `${day}|${instructorId}`;
}

function slotId(target: SlotTarget): string {
  return `slot|${target.day}|${target.instructorId}|${target.startsAt}`;
}

function parseSlotId(value: string): SlotTarget | null {
  const [kind, day, instructorId, startsAt] = value.split("|");
  if (kind !== "slot" || !day || !instructorId || !startsAt) return null;
  return { day, instructorId, startsAt };
}

function eventDurationMinutes(event: PlanningBoardEvent): number {
  return Math.max(SLOT_MINUTES, event.durationMinutes);
}

function eventTop(event: PlanningBoardEvent): number {
  const minutes = amsterdamMinuteOfDay(new Date(event.startsAt));
  return Math.max(
    0,
    ((minutes - START_HOUR * 60) / SLOT_MINUTES) * SLOT_HEIGHT,
  );
}

function eventHeight(event: PlanningBoardEvent): number {
  return Math.max(
    28,
    (eventDurationMinutes(event) / SLOT_MINUTES) * SLOT_HEIGHT - 4,
  );
}

function dateShort(day: string): string {
  return dateShortFormatter.format(startOfAmsterdamDayUtc(day));
}

function reasonText(validation: PlanningValidationResult | null): string[] {
  if (!validation) return [];
  return [...validation.blockingReasons, ...validation.warnings].map(
    (reason) => reason.message,
  );
}

function eventTone(event: PlanningBoardEvent): string {
  const tone = planningBoardEventTone(event);
  if (tone === "lesson") {
    return "border-blue-500/70 bg-blue-500/10 text-blue-950 dark:text-blue-100";
  }
  if (tone === "trial_lesson") {
    return "border-emerald-500/70 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100";
  }
  if (tone === "exam") {
    return "border-red-500/70 bg-red-500/10 text-red-950 dark:text-red-100";
  }
  if (tone === "interim_test") {
    return "border-orange-500/70 bg-orange-500/10 text-orange-950 dark:text-orange-100";
  }
  if (tone === "theory") {
    return "border-pink-500/70 bg-pink-500/10 text-pink-950 dark:text-pink-100";
  }
  if (tone === "admin") {
    return "border-slate-500/70 bg-slate-500/10 text-slate-950 dark:text-slate-100";
  }
  return "border-zinc-700/60 bg-zinc-700/10 text-zinc-950 dark:text-zinc-100";
}

function slotAvailability(
  blocks: readonly PlanningBoardAvailability[],
  day: string,
  slot: number,
): "available" | "blocked" | "closed" {
  const start = START_HOUR * 60 + slot * SLOT_MINUTES;
  const end = start + SLOT_MINUTES;
  const weekday = amsterdamWeekdayIndex(startOfAmsterdamDayUtc(day));
  const exception = blocks.find(
    (block) =>
      block.date === day && block.startMinute < end && block.endMinute > start,
  );
  if (exception) return exception.kind === "blocked" ? "blocked" : "available";
  const weekly = blocks.some(
    (block) =>
      block.weekday === weekday &&
      block.startMinute < end &&
      block.endMinute > start,
  );
  return weekly ? "available" : "closed";
}

function QueueCard({
  item,
  compact = false,
}: {
  item: PlanningQueueListItem;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `queue|${item.id}`,
      data: { kind: "queue", id: item.id } satisfies DragPayload,
    });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const title = item.student_name ?? item.lead_name ?? item.appointment_type;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border border-border bg-card p-3 text-sm shadow-sm",
        isDragging && "opacity-50",
        compact && "w-72",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 text-muted-foreground"
          aria-label="Sleep queue item"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.duration_minutes} min
            {item.required_transmission
              ? ` · ${item.required_transmission}`
              : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant={item.priority === "urgent" ? "danger" : "outline"}>
              {item.priority}
            </Badge>
            {item.service_area_name ? (
              <Badge variant="outline">{item.service_area_name}</Badge>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function EventCard({
  event,
  detailed = false,
}: {
  event: PlanningBoardEvent;
  detailed?: boolean;
}) {
  const draggable = event.entityType === "agenda_appointment";
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `appointment|${event.id}`,
      data: { kind: "appointment", id: event.id } satisfies DragPayload,
      disabled: !draggable,
    });
  const style = {
    top: eventTop(event),
    height: eventHeight(event),
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "absolute left-1 right-1 overflow-hidden rounded-md border px-2 py-1 text-xs shadow-sm",
        eventTone(event),
        detailed && "px-3 py-2",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
    >
      <p className="truncate font-medium text-foreground">{event.title}</p>
      <p className="truncate text-muted-foreground">
        {planningBoardEventLabel(event)}
        {event.vehicleLabel ? ` · ${event.vehicleLabel}` : ""}
      </p>
      {event.serviceAreaName ? (
        <p className="truncate text-muted-foreground">
          {event.serviceAreaName}
        </p>
      ) : null}
      {detailed ? (
        <p className="truncate text-muted-foreground">
          {event.durationMinutes} min
          {event.status ? ` - ${event.status}` : ""}
        </p>
      ) : null}
      {(event.warnings?.length ?? 0) > 0 ? (
        <p className="mt-0.5 truncate text-[11px] font-medium text-warning">
          {event.warnings?.[0]?.message}
        </p>
      ) : null}
    </div>
  );
}

function DroppableSlot({
  target,
  availability,
  availabilityFilter,
  preview,
}: {
  target: SlotTarget;
  availability: "available" | "blocked" | "closed";
  availabilityFilter?: "available" | "blocked" | null;
  preview?: {
    validation: PlanningValidationResult | null;
    message: string | null;
  } | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: slotId(target) });
  const isBlockedPreview =
    (preview?.validation?.blockingReasons.length ?? 0) > 0;
  const isWarningPreview =
    !isBlockedPreview && (preview?.validation?.warnings.length ?? 0) > 0;
  const previewText =
    preview?.validation?.blockingReasons[0]?.message ??
    preview?.validation?.warnings[0]?.message ??
    preview?.message;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative border-b border-border/60",
        availability === "available" && "bg-emerald-500/5",
        availability === "blocked" && "bg-danger/10",
        availability === "closed" && "bg-muted/30",
        availabilityFilter &&
          availability !== availabilityFilter &&
          "opacity-30",
        isOver && "bg-primary/20 ring-1 ring-inset ring-primary",
        isBlockedPreview && "bg-danger/20 ring-1 ring-inset ring-danger",
        isWarningPreview && "bg-warning/20 ring-1 ring-inset ring-warning",
        preview?.validation?.allowed &&
          !isWarningPreview &&
          "bg-success/10 ring-1 ring-inset ring-success",
      )}
      style={{ height: SLOT_HEIGHT }}
      title={previewText ?? undefined}
    >
      {previewText ? (
        <span
          className={cn(
            "pointer-events-none absolute inset-x-1 top-1 truncate text-[10px] font-medium",
            isBlockedPreview && "text-danger",
            isWarningPreview && "text-warning",
            preview?.validation?.allowed && !isWarningPreview && "text-success",
          )}
        >
          {previewText}
        </span>
      ) : null}
    </div>
  );
}

export function PlanningBoardWorkspace({
  data,
  detailMode = false,
}: {
  data: PlanningBoardData;
  detailMode?: boolean;
}) {
  const [queueItems, setQueueItems] = useState(data.queueItems);
  const [events, setEvents] = useState(data.events);
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    data.defaultVehicleId ?? "",
  );
  const [activeQueue, setActiveQueue] = useState<PlanningQueueListItem | null>(
    null,
  );
  const [preview, setPreview] = useState<{
    target: string;
    validation: PlanningValidationResult | null;
    message: string | null;
  } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lastPreviewTarget = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const slotCount = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES;
  const columns = useMemo(
    () =>
      data.days.flatMap((day) =>
        data.instructors.map((instructor) => ({
          day,
          instructor,
          key: columnKey(day, instructor.id),
        })),
      ),
    [data.days, data.instructors],
  );
  const eventsByColumn = useMemo(() => {
    const map = new Map<string, PlanningBoardEvent[]>();
    for (const event of events) {
      const day = amsterdamYmd(new Date(event.startsAt));
      const key = columnKey(day, event.instructorId);
      const bucket = map.get(key) ?? [];
      bucket.push(event);
      map.set(key, bucket);
    }
    return map;
  }, [events]);
  const availabilityByInstructor = useMemo(() => {
    const map = new Map<string, PlanningBoardAvailability[]>();
    for (const block of data.availability) {
      const bucket = map.get(block.instructorId) ?? [];
      bucket.push(block);
      map.set(block.instructorId, bucket);
    }
    return map;
  }, [data.availability]);

  function activePayload(id: string): DragPayload | null {
    const [kind, itemId] = id.split("|");
    if (kind === "queue" && itemId) return { kind, id: itemId };
    if (kind === "appointment" && itemId) return { kind, id: itemId };
    return null;
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id ? String(event.over.id) : null;
    const payload = activePayload(String(event.active.id));
    const target = overId ? parseSlotId(overId) : null;
    if (
      !payload ||
      !target ||
      lastPreviewTarget.current === `${event.active.id}:${overId}`
    )
      return;
    const targetId = overId ?? "";
    if (!targetId) return;
    lastPreviewTarget.current = `${event.active.id}:${targetId}`;
    startTransition(async () => {
      const result =
        payload.kind === "queue"
          ? await previewQueueDropAction({
              queueItemId: payload.id,
              instructorId: target.instructorId,
              startsAt: target.startsAt,
              vehicleId: selectedVehicleId || null,
            })
          : await previewAppointmentMoveAction({
              appointmentId: payload.id,
              instructorId: target.instructorId,
              startsAt: target.startsAt,
              vehicleId: selectedVehicleId || null,
            });
      setPreview({
        target: targetId,
        validation: result.validation ?? null,
        message: result.message ?? null,
      });
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const payload = activePayload(String(event.active.id));
    const target = event.over?.id ? parseSlotId(String(event.over.id)) : null;
    setActiveQueue(null);
    if (!payload || !target) return;
    startTransition(async () => {
      setStatus("Planning wordt gecontroleerd...");
      const result =
        payload.kind === "queue"
          ? await scheduleQueueDropAction({
              queueItemId: payload.id,
              instructorId: target.instructorId,
              startsAt: target.startsAt,
              vehicleId: selectedVehicleId || null,
            })
          : await rescheduleBoardAppointmentAction({
              appointmentId: payload.id,
              instructorId: target.instructorId,
              startsAt: target.startsAt,
              vehicleId: selectedVehicleId || null,
            });
      if (!result.ok) {
        setStatus(result.message ?? "Planning geblokkeerd.");
        setPreview({
          target: slotId(target),
          validation: result.validation ?? null,
          message: result.message ?? null,
        });
        return;
      }
      if (payload.kind === "queue") {
        setQueueItems((previous) =>
          previous.filter((item) => item.id !== payload.id),
        );
      } else {
        setEvents((previous) =>
          previous.map((item) =>
            item.id === payload.id
              ? {
                  ...item,
                  instructorId: target.instructorId,
                  startsAt: target.startsAt,
                  endsAt: new Date(
                    (parseAmsterdamDateTime(target.startsAt)?.getTime() ??
                      Date.now()) +
                      eventDurationMinutes(item) * 60000,
                  ).toISOString(),
                }
              : item,
          ),
        );
      }
      setStatus("Planning opgeslagen.");
      setPreview({
        target: slotId(target),
        validation: result.validation ?? null,
        message: null,
      });
    });
  }

  function planFromFallback(formData: FormData) {
    const queueItemId = String(formData.get("queue_item_id") ?? "");
    const instructorId = String(formData.get("instructor_id") ?? "");
    const startsAt = String(formData.get("starts_at") ?? "");
    const vehicleId = String(formData.get("vehicle_id") ?? "") || null;
    startTransition(async () => {
      const result = await scheduleQueueDropAction({
        queueItemId,
        instructorId,
        startsAt,
        vehicleId,
      });
      if (result.ok) {
        setQueueItems((previous) =>
          previous.filter((item) => item.id !== queueItemId),
        );
        setStatus("Planning opgeslagen.");
      } else {
        setStatus(result.message ?? "Planning geblokkeerd.");
        setPreview({
          target: queueItemId,
          validation: result.validation ?? null,
          message: result.message ?? null,
        });
      }
    });
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event) => {
        const payload = activePayload(String(event.active.id));
        setActiveQueue(
          payload?.kind === "queue"
            ? (queueItems.find((item) => item.id === payload.id) ?? null)
            : null,
        );
      }}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveQueue(null)}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0 overflow-hidden rounded-md border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-3">
            <div className="flex flex-wrap items-center gap-3">
              {EVENT_LEGEND.map((item) => (
                <span
                  key={item.key}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span
                    className={cn("h-2.5 w-2.5 rounded-sm", item.className)}
                  />
                  {item.label}
                </span>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Car className="h-4 w-4" aria-hidden />
              <Select
                value={selectedVehicleId}
                onChange={(event) => setSelectedVehicleId(event.target.value)}
                className="h-8 w-44 text-xs"
              >
                <option value="">Automatisch/geen</option>
                {data.vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] border-b border-border bg-muted/30">
            <div className="px-3 py-3 text-xs font-medium text-muted-foreground">
              Tijd
            </div>
            <div
              className="grid min-w-[54rem]"
              style={{
                gridTemplateColumns: `repeat(${columns.length}, minmax(10rem, 1fr))`,
              }}
            >
              {columns.map((column) => (
                <div
                  key={column.key}
                  className="border-l border-border px-3 py-3"
                >
                  <p className="truncate text-xs font-medium text-muted-foreground">
                    {dateShort(column.day)}
                  </p>
                  <Link
                    href={`/backoffice/planning-board/instructors/${column.instructor.id}?date=${column.day}&view=${data.filters.view}`}
                    className="block truncate text-sm font-semibold text-foreground hover:text-primary"
                  >
                    {column.instructor.name}
                  </Link>
                </div>
              ))}
            </div>
          </div>
          <div className="max-h-[72vh] overflow-auto">
            <div className="grid grid-cols-[4.5rem_minmax(54rem,1fr)]">
              <div>
                {Array.from({ length: slotCount }, (_, slot) => (
                  <div
                    key={slot}
                    className="border-b border-border/60 px-3 text-xs text-muted-foreground"
                    style={{ height: SLOT_HEIGHT }}
                  >
                    {slot % 2 === 0 ? timeLabel(slot) : ""}
                  </div>
                ))}
              </div>
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${columns.length}, minmax(10rem, 1fr))`,
                }}
              >
                {columns.map((column) => {
                  const columnEvents = eventsByColumn.get(column.key) ?? [];
                  const blocks =
                    availabilityByInstructor.get(column.instructor.id) ?? [];
                  return (
                    <div
                      key={column.key}
                      className="relative border-l border-border"
                    >
                      {Array.from({ length: slotCount }, (_, slot) => {
                        const target = {
                          day: column.day,
                          instructorId: column.instructor.id,
                          startsAt: localSlotIso(column.day, slot),
                        };
                        const targetId = slotId(target);
                        return (
                          <DroppableSlot
                            key={slot}
                            target={target}
                            availability={slotAvailability(
                              blocks,
                              column.day,
                              slot,
                            )}
                            availabilityFilter={data.filters.availability}
                            preview={
                              preview?.target === targetId ? preview : null
                            }
                          />
                        );
                      })}
                      {columnEvents.map((event) => (
                        <EventCard
                          key={`${event.entityType}:${event.id}`}
                          event={event}
                          detailed={detailMode}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4" aria-hidden />
                Planning queue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {queueItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Geen open items.
                </p>
              ) : (
                queueItems.map((item) => (
                  <div key={item.id} className="space-y-2">
                    <QueueCard item={item} />
                    <form
                      action={planFromFallback}
                      className="grid gap-2 rounded-md border border-border p-2 md:hidden"
                    >
                      <input
                        type="hidden"
                        name="queue_item_id"
                        value={item.id}
                      />
                      <Label className="text-xs">Click-to-plan</Label>
                      <Select name="instructor_id" required>
                        <option value="">Instructeur</option>
                        {data.instructors.map((instructor) => (
                          <option key={instructor.id} value={instructor.id}>
                            {instructor.name}
                          </option>
                        ))}
                      </Select>
                      <Input name="starts_at" type="datetime-local" required />
                      <Select name="vehicle_id">
                        <option value="">Geen voertuig</option>
                        {data.vehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.label}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" size="sm" disabled={pending}>
                        Plannen
                      </Button>
                    </form>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {pending ? (
                <p className="text-muted-foreground">Controleren...</p>
              ) : null}
              {status ? (
                <p className="text-muted-foreground">{status}</p>
              ) : null}
              {preview?.validation?.allowed ? (
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Toegestaan
                </div>
              ) : preview ? (
                <div className="flex items-center gap-2 text-danger">
                  <AlertCircle className="h-4 w-4" aria-hidden />
                  {preview.message ?? "Geblokkeerd"}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Sleep een kaart naar een slot.
                </p>
              )}
              {reasonText(preview?.validation ?? null).map((reason) => (
                <p
                  key={reason}
                  className="rounded-md bg-muted px-2 py-1 text-muted-foreground"
                >
                  {reason}
                </p>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
      <DragOverlay>
        {activeQueue ? <QueueCard item={activeQueue} compact /> : null}
      </DragOverlay>
    </DndContext>
  );
}
