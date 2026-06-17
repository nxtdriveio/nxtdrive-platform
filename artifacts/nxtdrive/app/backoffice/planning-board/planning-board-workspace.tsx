"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
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
  ExternalLink,
  GripVertical,
  Pencil,
  X,
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
  planningBoardEventCanMove,
  planningBoardEventLabel,
  planningBoardEventTone,
  planningBoardLayoutMode,
} from "@/lib/planning-board/presentation";
import type {
  PlanningBoardAvailability,
  PlanningBoardData,
  PlanningBoardEvent,
} from "@/lib/planning-board/types";
import type { PlanningQueueListItem } from "@/lib/planning-queue";
import type { PlanningValidationResult } from "@/lib/planning-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  previewBoardEventMoveAction,
  previewQueueDropAction,
  rescheduleBoardEventAction,
  scheduleQueueDropAction,
} from "./actions";

const START_HOUR = 7;
const END_HOUR = 21;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 30;
const SLOT_WIDTH = 42;
const RESOURCE_ROW_HEIGHT = 48;
const RESOURCE_COLUMN_WIDTH = 152;
const PREVIEW_DEBOUNCE_MS = 180;
const dateShortFormatter = createNlDateTimeFormatter({
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
const timeFormatter = createNlDateTimeFormatter({
  hour: "2-digit",
  minute: "2-digit",
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

const AVAILABILITY_LEGEND = [
  { key: "available", label: "Beschikbaar", className: "bg-emerald-500/35" },
  {
    key: "blocked",
    label: "Geblokkeerd",
    className:
      "bg-red-500/20 [background-image:repeating-linear-gradient(135deg,rgba(239,68,68,.35)_0,rgba(239,68,68,.35)_2px,transparent_2px,transparent_7px)]",
  },
  { key: "closed", label: "Gesloten", className: "bg-muted/60" },
] as const;

type DragPayload =
  | { kind: "queue"; id: string }
  | {
      kind: "event";
      id: string;
      entityType: PlanningBoardEvent["entityType"];
    };

type SlotTarget = {
  instructorId: string;
  day: string;
  startsAt: string;
};

type PositionedEvent = {
  event: PlanningBoardEvent;
  lane: number;
  laneCount: number;
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
  return Math.max(SLOT_MINUTES, event.occupiedMinutes ?? event.durationMinutes);
}

function eventTop(event: PlanningBoardEvent): number {
  const minutes = amsterdamMinuteOfDay(new Date(event.startsAt));
  return Math.max(
    0,
    ((minutes - START_HOUR * 60) / SLOT_MINUTES) * SLOT_HEIGHT,
  );
}

function eventLeft(event: PlanningBoardEvent): number {
  const minutes = amsterdamMinuteOfDay(new Date(event.startsAt));
  return Math.max(
    0,
    ((minutes - START_HOUR * 60) / SLOT_MINUTES) * SLOT_WIDTH,
  );
}

function eventHeight(event: PlanningBoardEvent): number {
  return Math.max(
    28,
    (eventDurationMinutes(event) / SLOT_MINUTES) * SLOT_HEIGHT - 4,
  );
}

function eventWidth(event: PlanningBoardEvent): number {
  return Math.max(
    44,
    (eventDurationMinutes(event) / SLOT_MINUTES) * SLOT_WIDTH - 4,
  );
}

function eventLaneStyle(lane: number, laneCount: number) {
  const availableHeight = RESOURCE_ROW_HEIGHT - 12;
  const laneHeight = availableHeight / Math.max(1, laneCount);
  return {
    top: 6 + lane * laneHeight,
    height: Math.max(22, laneHeight - 4),
  };
}

function layoutEventGroup(
  group: readonly PlanningBoardEvent[],
): PositionedEvent[] {
  const laneEnds: number[] = [];
  const positioned = group.map((event) => {
    const start = Date.parse(event.startsAt);
    const end = Date.parse(event.endsAt);
    let lane = laneEnds.findIndex((laneEnd) => start >= laneEnd);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = end;
    return { event, lane, laneCount: 1 };
  });
  const laneCount = Math.max(1, laneEnds.length);
  return positioned.map((item) => ({ ...item, laneCount }));
}

function layoutOverlappingEvents(
  events: readonly PlanningBoardEvent[],
): PositionedEvent[] {
  const sorted = [...events].sort((left, right) =>
    left.startsAt.localeCompare(right.startsAt),
  );
  const result: PositionedEvent[] = [];
  let group: PlanningBoardEvent[] = [];
  let groupEnd = 0;

  for (const event of sorted) {
    const start = Date.parse(event.startsAt);
    const end = Date.parse(event.endsAt);
    if (group.length > 0 && start >= groupEnd) {
      result.push(...layoutEventGroup(group));
      group = [];
      groupEnd = 0;
    }
    group.push(event);
    groupEnd = Math.max(groupEnd, end);
  }

  if (group.length > 0) result.push(...layoutEventGroup(group));
  return result;
}

function dateShort(day: string): string {
  return dateShortFormatter.format(startOfAmsterdamDayUtc(day));
}

function reasonText(validation: PlanningValidationResult | null): string[] {
  if (!validation) return [];
  return [...validation.blockingReasons, ...validation.warnings].map(
    (reason) => humanizePlanningMessage(reason.message),
  );
}

function humanizePlanningMessage(message: string): string {
  if (message.includes("student branch does not match planning queue item branch")) {
    return "Vestiging klopt niet: leerling en queue-item horen bij verschillende vestigingen.";
  }
  if (message.includes("Cannot access") && message.includes("before initialization")) {
    return "De preview kon niet worden berekend. Probeer opnieuw of laad het planning board opnieuw.";
  }
  return message;
}

function eventDetailHref(event: PlanningBoardEvent): string {
  if (event.entityType === "lesson") return `/backoffice/agenda/${event.id}`;
  if (event.entityType === "trial_lesson" && event.leadId) {
    return `/backoffice/leads/${event.leadId}`;
  }
  return `/backoffice/agenda/afspraak/${event.id}`;
}

function eventRelatedHref(event: PlanningBoardEvent): string | null {
  if (event.studentId) return `/backoffice/leerlingen/${event.studentId}`;
  if (event.leadId) return `/backoffice/leads/${event.leadId}`;
  return null;
}

function eventRelatedLabel(event: PlanningBoardEvent): string {
  return event.studentId ? "Open leerling" : "Open lead";
}

function queueScheduledHref(item: PlanningQueueListItem): string | null {
  if (!item.scheduled_entity_id || !item.scheduled_entity_type) return null;
  if (item.scheduled_entity_type === "lesson") {
    return `/backoffice/agenda/${item.scheduled_entity_id}`;
  }
  if (item.scheduled_entity_type === "agenda_appointment") {
    return `/backoffice/agenda/afspraak/${item.scheduled_entity_id}`;
  }
  return item.lead_id ? `/backoffice/leads/${item.lead_id}` : null;
}

function eventMatchesQueueItem(
  event: PlanningBoardEvent,
  item: PlanningQueueListItem,
): boolean {
  if (
    item.scheduled_entity_id &&
    item.scheduled_entity_type &&
    event.id === item.scheduled_entity_id &&
    event.entityType === item.scheduled_entity_type
  ) {
    return true;
  }
  if (item.student_id && event.studentId !== item.student_id) return false;
  if (item.lead_id && event.leadId !== item.lead_id) return false;
  if (!item.student_id && !item.lead_id) return false;
  if (item.appointment_type === "lesson") return event.entityType === "lesson";
  if (item.appointment_type === "trial_lesson") {
    return event.entityType === "trial_lesson";
  }
  return (
    event.entityType === "agenda_appointment" &&
    event.appointmentType === item.appointment_type
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

function availabilityLabel(
  availability: "available" | "blocked" | "closed",
): string {
  if (availability === "available") return "Beschikbaar";
  if (availability === "blocked") return "Geblokkeerd";
  return "Gesloten";
}

function availabilitySegmentStyle(startMinute: number, endMinute: number) {
  const timelineStart = START_HOUR * 60;
  const timelineEnd = END_HOUR * 60;
  const start = Math.max(timelineStart, startMinute);
  const end = Math.min(timelineEnd, endMinute);
  if (end <= start) return null;
  return {
    left: ((start - timelineStart) / SLOT_MINUTES) * SLOT_WIDTH,
    width: ((end - start) / SLOT_MINUTES) * SLOT_WIDTH,
  };
}

function AvailabilityBands({
  blocks,
  day,
  availabilityFilter,
}: {
  blocks: readonly PlanningBoardAvailability[];
  day: string;
  availabilityFilter?: "available" | "blocked" | null;
}) {
  const weekday = amsterdamWeekdayIndex(startOfAmsterdamDayUtc(day));
  const dayBlocks = blocks.filter(
    (block) => block.date === day || block.weekday === weekday,
  );
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className={cn(
          "absolute inset-0 bg-muted/45",
          availabilityFilter && availabilityFilter !== "blocked" && "opacity-40",
        )}
      />
      {dayBlocks.map((block, index) => {
        const style = availabilitySegmentStyle(
          block.startMinute,
          block.endMinute,
        );
        if (!style) return null;
        const isBlocked = block.kind === "blocked";
        return (
          <div
            key={`${block.instructorId}:${block.date ?? block.weekday}:${block.startMinute}:${index}`}
            className={cn(
              "absolute inset-y-0",
              isBlocked
                ? "bg-red-500/18 [background-image:repeating-linear-gradient(135deg,rgba(239,68,68,.35)_0,rgba(239,68,68,.35)_2px,transparent_2px,transparent_7px)]"
                : "bg-emerald-500/14",
              availabilityFilter &&
                ((availabilityFilter === "available" && isBlocked) ||
                  (availabilityFilter === "blocked" && !isBlocked)) &&
                "opacity-25",
            )}
            style={style}
          />
        );
      })}
    </div>
  );
}

function QueueCard({
  item,
  compact = false,
  href,
  relatedLabel,
}: {
  item: PlanningQueueListItem;
  compact?: boolean;
  href?: string | null;
  relatedLabel?: string | null;
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
  const content = (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-5 text-foreground">
            {title}
          </p>
          <p className="truncate text-[11px] leading-4 text-muted-foreground">
            {item.duration_minutes} min
            {item.required_transmission ? ` · ${item.required_transmission}` : ""}
            {item.service_area_name ? ` · ${item.service_area_name}` : ""}
          </p>
        </div>
        <Badge
          variant={item.priority === "urgent" ? "danger" : "outline"}
          className="shrink-0 text-[10px]"
        >
          {item.priority}
        </Badge>
      </div>
      {href ? (
        <p className="mt-1 truncate text-[11px] leading-4 text-primary">
          {relatedLabel ?? "Open afspraak"}
        </p>
      ) : null}
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border border-border bg-[color-mix(in_oklab,var(--surface-1)_84%,transparent)] text-sm shadow-[var(--admin-card-shadow)] backdrop-blur-sm transition-opacity",
        compact ? "w-60 p-2 opacity-80" : "p-2.5",
        isDragging && "opacity-25",
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="shrink-0 text-muted-foreground"
          aria-label="Sleep queue item"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
        {href ? (
          <Link
            href={href}
            className="min-w-0 flex-1 rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            {content}
          </Link>
        ) : (
          <div className="min-w-0 flex-1">{content}</div>
        )}
      </div>
    </div>
  );
}

function EventCard({
  event,
  detailed = false,
  layout = "calendar",
  lane = 0,
  laneCount = 1,
  onOpen,
}: {
  event: PlanningBoardEvent;
  detailed?: boolean;
  layout?: "calendar" | "timeline";
  lane?: number;
  laneCount?: number;
  onOpen?: (event: PlanningBoardEvent) => void;
}) {
  const draggable = planningBoardEventCanMove(event);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `event|${event.entityType}|${event.id}`,
      data: {
        kind: "event",
        id: event.id,
        entityType: event.entityType,
      } satisfies DragPayload,
      disabled: !draggable,
    });
  const style =
    layout === "timeline"
      ? {
          left: eventLeft(event),
          width: eventWidth(event),
          ...eventLaneStyle(lane, laneCount),
        }
      : {
          top: eventTop(event),
          height: eventHeight(event),
        };
  const transformStyle = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...transformStyle }}
      className={cn(
        "absolute overflow-hidden rounded-md border px-1.5 py-0.5 text-[11px] shadow-sm",
        layout === "calendar" && "left-1 right-1",
        eventTone(event),
        detailed && "px-2.5 py-1.5 text-xs",
        onOpen && "cursor-pointer",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
      onClick={() => onOpen?.(event)}
      onKeyDown={(keyboardEvent) => {
        if (!onOpen) return;
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          onOpen(event);
        }
      }}
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
          {event.durationMinutes} min lestijd
          {event.bufferMinutes ? ` + ${event.bufferMinutes} buffer` : ""}
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
  layout = "calendar",
  preview,
}: {
  target: SlotTarget;
  availability: "available" | "blocked" | "closed";
  availabilityFilter?: "available" | "blocked" | null;
  layout?: "calendar" | "timeline";
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
  const title = previewText
    ? `${availabilityLabel(availability)} - ${previewText}`
    : availabilityLabel(availability);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative shrink-0",
        layout === "calendar" && "border-b border-border/60",
        layout === "timeline" && "border-r border-border/60",
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
      style={
        layout === "timeline"
          ? { width: SLOT_WIDTH, height: "100%" }
          : { height: SLOT_HEIGHT }
      }
      title={title}
      aria-label={title}
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
  filterForm,
}: {
  data: PlanningBoardData;
  detailMode?: boolean;
  filterForm?: ReactNode;
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
  const [selectedEvent, setSelectedEvent] =
    useState<PlanningBoardEvent | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lastPreviewTarget = useRef<string | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRequest = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const slotCount = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES;
  const layoutMode = planningBoardLayoutMode(detailMode);
  const visibleDays = useMemo(() => {
    if (layoutMode === "instructor_timeline") return data.days;
    return [data.filters.date];
  }, [data.days, data.filters.date, layoutMode]);
  const rows = useMemo(
    () =>
      visibleDays.flatMap((day) =>
        data.instructors.map((instructor) => ({
          day,
          instructor,
          key: columnKey(day, instructor.id),
        })),
      ),
    [visibleDays, data.instructors],
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
  const queueEventLinks = useMemo(() => {
    const map = new Map<string, { href: string; label: string }>();
    for (const item of queueItems) {
      const scheduledHref = queueScheduledHref(item);
      if (scheduledHref) {
        map.set(item.id, { href: scheduledHref, label: "Open afspraak" });
        continue;
      }
      const relatedEvent = events.find((event) =>
        eventMatchesQueueItem(event, item),
      );
      if (relatedEvent) {
        map.set(item.id, {
          href: eventDetailHref(relatedEvent),
          label: "Bestaande afspraak",
        });
      }
    }
    return map;
  }, [events, queueItems]);
  const availabilityByInstructor = useMemo(() => {
    const map = new Map<string, PlanningBoardAvailability[]>();
    for (const block of data.availability) {
      const bucket = map.get(block.instructorId) ?? [];
      bucket.push(block);
      map.set(block.instructorId, bucket);
    }
    return map;
  }, [data.availability]);

  function clearPreviewTimer() {
    if (!previewTimer.current) return;
    clearTimeout(previewTimer.current);
    previewTimer.current = null;
  }

  useEffect(() => {
    return () => clearPreviewTimer();
  }, []);

  function activePayload(id: string): DragPayload | null {
    const [kind, first, second] = id.split("|");
    if (kind === "queue" && first) return { kind, id: first };
    if (
      kind === "event" &&
      second &&
      (first === "lesson" ||
        first === "trial_lesson" ||
        first === "agenda_appointment")
    ) {
      return { kind, id: second, entityType: first };
    }
    return null;
  }

  function schedulePreview(
    payload: DragPayload,
    target: SlotTarget,
    targetId: string,
    activeKey: string,
  ) {
    lastPreviewTarget.current = activeKey;
    clearPreviewTimer();
    const requestId = ++previewRequest.current;
    previewTimer.current = setTimeout(() => {
      previewTimer.current = null;
      startTransition(async () => {
        try {
          const result =
            payload.kind === "queue"
              ? await previewQueueDropAction({
                  queueItemId: payload.id,
                  instructorId: target.instructorId,
                  startsAt: target.startsAt,
                  vehicleId: selectedVehicleId || null,
                })
              : await previewBoardEventMoveAction({
                  entityType: payload.entityType,
                  entityId: payload.id,
                  instructorId: target.instructorId,
                  startsAt: target.startsAt,
                  vehicleId: selectedVehicleId || null,
                });
          if (previewRequest.current !== requestId) return;
          setPreview({
            target: targetId,
            validation: result.validation ?? null,
            message: result.message
              ? humanizePlanningMessage(result.message)
              : null,
          });
        } catch (error) {
          if (previewRequest.current !== requestId) return;
          setPreview({
            target: targetId,
            validation: null,
            message: humanizePlanningMessage(
              error instanceof Error
                ? error.message
                : "Preview kon niet worden berekend.",
            ),
          });
        }
      });
    }, PREVIEW_DEBOUNCE_MS);
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
    schedulePreview(
      payload,
      target,
      targetId,
      `${event.active.id}:${targetId}`,
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const payload = activePayload(String(event.active.id));
    const target = event.over?.id ? parseSlotId(String(event.over.id)) : null;
    clearPreviewTimer();
    previewRequest.current += 1;
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
          : await rescheduleBoardEventAction({
              entityType: payload.entityType,
              entityId: payload.id,
              instructorId: target.instructorId,
              startsAt: target.startsAt,
              vehicleId: selectedVehicleId || null,
            });
      if (!result.ok) {
        setStatus(
          result.message
            ? humanizePlanningMessage(result.message)
            : "Planning geblokkeerd.",
        );
        setPreview({
          target: slotId(target),
          validation: result.validation ?? null,
          message: result.message
            ? humanizePlanningMessage(result.message)
            : null,
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
            item.id === payload.id && item.entityType === payload.entityType
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
        setStatus(
          result.message
            ? humanizePlanningMessage(result.message)
            : "Planning geblokkeerd.",
        );
        setPreview({
          target: queueItemId,
          validation: result.validation ?? null,
          message: result.message
            ? humanizePlanningMessage(result.message)
            : null,
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
      onDragCancel={() => {
        clearPreviewTimer();
        previewRequest.current += 1;
        setActiveQueue(null);
      }}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-[var(--surface-1)] shadow-[var(--admin-card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium text-foreground">
                {dateShort(data.filters.date)}
              </span>
              {EVENT_LEGEND.map((item) => (
                <span
                  key={item.key}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground"
                >
                  <span
                    className={cn("h-2 w-2 rounded-sm", item.className)}
                  />
                  {item.label}
                </span>
              ))}
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
              {AVAILABILITY_LEGEND.map((item) => (
                <span
                  key={item.key}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground"
                >
                  <span
                    className={cn(
                      "h-2.5 w-4 rounded-sm border border-border/60",
                      item.className,
                    )}
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
          <div className="max-h-[72vh] overflow-auto">
            <div
              className="min-w-max"
              style={{ width: RESOURCE_COLUMN_WIDTH + slotCount * SLOT_WIDTH }}
            >
              <div className="sticky top-0 z-20 grid grid-cols-[9.5rem_minmax(0,1fr)] border-b border-border bg-[var(--surface-2)]">
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Instructeur
                </div>
                <div className="flex">
                  {Array.from({ length: slotCount }, (_, slot) => (
                    <div
                      key={slot}
                      className="shrink-0 border-l border-[var(--admin-grid-line)] px-1 py-1.5 text-[11px] font-medium text-muted-foreground"
                      style={{ width: SLOT_WIDTH }}
                    >
                      {slot % 2 === 0 ? timeLabel(slot) : ""}
                    </div>
                  ))}
                </div>
              </div>
              {rows.map((row) => {
                const rowEvents = layoutOverlappingEvents(
                  eventsByColumn.get(row.key) ?? [],
                );
                const blocks =
                  availabilityByInstructor.get(row.instructor.id) ?? [];
                return (
                  <div
                    key={row.key}
                    className="grid grid-cols-[9.5rem_minmax(0,1fr)] border-b border-[var(--admin-grid-line)]"
                    style={{ height: RESOURCE_ROW_HEIGHT }}
                  >
                    <div className="flex min-w-0 flex-col justify-center border-r border-[var(--admin-grid-line)] bg-[var(--surface-1)] px-3">
                      <Link
                        href={`/backoffice/planning-board/instructors/${row.instructor.id}?date=${row.day}&view=${detailMode ? data.filters.view : "day"}`}
                        className="truncate text-xs font-semibold text-foreground hover:text-primary"
                      >
                        {row.instructor.name}
                      </Link>
                      {detailMode ? (
                        <span className="text-xs text-muted-foreground">
                          {dateShort(row.day)}
                        </span>
                      ) : null}
                    </div>
                    <div className="relative flex">
                      <AvailabilityBands
                        blocks={blocks}
                        day={row.day}
                        availabilityFilter={data.filters.availability}
                      />
                      {Array.from({ length: slotCount }, (_, slot) => {
                        const target = {
                          day: row.day,
                          instructorId: row.instructor.id,
                          startsAt: localSlotIso(row.day, slot),
                        };
                        const targetId = slotId(target);
                        return (
                          <DroppableSlot
                            key={slot}
                            target={target}
                            availability={slotAvailability(blocks, row.day, slot)}
                            availabilityFilter={data.filters.availability}
                            layout="timeline"
                            preview={
                              preview?.target === targetId ? preview : null
                            }
                          />
                        );
                      })}
                      {rowEvents.map(({ event, lane, laneCount }) => (
                        <EventCard
                          key={`${event.entityType}:${event.id}`}
                          event={event}
                          lane={lane}
                          laneCount={laneCount}
                          detailed={detailMode}
                          layout="timeline"
                          onOpen={setSelectedEvent}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="space-y-3">
          <Card className="shadow-[var(--admin-card-shadow)]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4" aria-hidden />
                Planning queue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {queueItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Geen open items.
                </p>
              ) : (
                queueItems.map((item) => {
                  const linkedEvent = queueEventLinks.get(item.id);
                  return (
                  <div key={item.id} className="space-y-2">
                    <QueueCard
                      item={item}
                      href={linkedEvent?.href}
                      relatedLabel={linkedEvent?.label}
                    />
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
                );
                })
              )}
            </CardContent>
          </Card>

          {filterForm ? (
            <Card className="shadow-[var(--admin-card-shadow)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Filters</CardTitle>
              </CardHeader>
              <CardContent>{filterForm}</CardContent>
            </Card>
          ) : null}

          <Card className="shadow-[var(--admin-card-shadow)]">
            <CardHeader className="pb-2">
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
              {reasonText(preview?.validation ?? null)
                .filter((reason) => reason !== preview?.message)
                .map((reason) => (
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
      {selectedEvent ? (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-border bg-background p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {planningBoardEventLabel(selectedEvent)}
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold text-foreground">
                {selectedEvent.title}
              </h2>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Sluit afspraakdetails"
              onClick={() => setSelectedEvent(null)}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link
              href={eventDetailHref(selectedEvent)}
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-3 text-sm font-medium text-foreground hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Open
            </Link>
            {eventRelatedHref(selectedEvent) ? (
              <Link
                href={eventRelatedHref(selectedEvent) ?? "#"}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-3 text-sm font-medium text-foreground hover:bg-muted"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                {eventRelatedLabel(selectedEvent)}
              </Link>
            ) : null}
            <Link
              href={eventDetailHref(selectedEvent)}
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-muted px-3 text-sm font-medium text-foreground hover:bg-muted/70"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              Wijzigen
            </Link>
            <Link
              href={eventDetailHref(selectedEvent)}
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-3 text-sm font-medium text-foreground hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Acties
            </Link>
          </div>
          <dl className="mt-5 grid gap-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Tijd
              </dt>
              <dd className="text-foreground">
                {timeFormatter.format(new Date(selectedEvent.startsAt))} -{" "}
                {timeFormatter.format(new Date(selectedEvent.endsAt))} (
                {selectedEvent.durationMinutes} min lestijd
                {selectedEvent.bufferMinutes
                  ? ` + ${selectedEvent.bufferMinutes} min buffer`
                  : ""}
                )
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Voertuig
              </dt>
              <dd className="text-foreground">
                {selectedEvent.vehicleLabel ?? "Geen voertuig"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Rayon
              </dt>
              <dd className="text-foreground">
                {selectedEvent.serviceAreaName ?? "Geen rayon"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Status
              </dt>
              <dd className="text-foreground">
                {selectedEvent.status ?? "Onbekend"}
              </dd>
            </div>
          </dl>
          {(selectedEvent.warnings?.length ?? 0) > 0 ? (
            <div className="mt-5 space-y-2">
              <p className="text-xs font-medium uppercase text-warning">
                Waarschuwingen
              </p>
              {selectedEvent.warnings?.map((warning) => (
                <p
                  key={`${warning.code}:${warning.message}`}
                  className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning"
                >
                  {warning.message}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <DragOverlay>
        {activeQueue ? <QueueCard item={activeQueue} compact /> : null}
      </DragOverlay>
    </DndContext>
  );
}
