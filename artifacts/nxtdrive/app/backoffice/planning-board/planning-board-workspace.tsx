"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
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
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  createNlDateTimeFormatter,
  parseZonedDateTime,
  startOfZonedDayUtc,
  zonedMinuteOfDay,
  zonedWeekdayIndex,
  zonedYmd,
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
  PlanningBoardPerspective,
} from "@/lib/planning-board/types";
import type { PlanningQueueListItem } from "@/lib/planning-queue";
import type { PlanningValidationResult } from "@/lib/planning-core";
import { formatPlanningReason } from "@/lib/planning-core";
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

const START_HOUR = 8;
const END_HOUR = 18;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 30;
const SLOT_WIDTH = 56;
const RESOURCE_ROW_HEIGHT = 56;
const RESOURCE_COLUMN_WIDTH = 176;
const SLOT_COUNT = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES;
const SLOT_PERCENT = 100 / SLOT_COUNT;
const TIMELINE_MINUTES = (END_HOUR - START_HOUR) * 60;
const PREVIEW_DEBOUNCE_MS = 180;
const EVENT_LEGEND = [
  {
    key: "lesson",
    label: "Rijles",
    className: "bg-planning-lesson border-planning-lesson",
  },
  {
    key: "trial_lesson",
    label: "Proefles",
    className: "bg-planning-trial border-planning-trial",
  },
  {
    key: "interim_test",
    label: "TTT",
    className: "bg-planning-ttt border-planning-ttt",
  },
  {
    key: "exam",
    label: "Examen",
    className: "bg-planning-exam border-planning-exam",
  },
  {
    key: "admin",
    label: "Administratie",
    className: "bg-planning-admin border-planning-admin",
  },
  {
    key: "theory_guidance",
    label: "Theorie",
    className: "bg-planning-theory border-planning-theory",
  },
  {
    key: "block",
    label: "Prive/pauze/blok",
    className: "bg-planning-block border-planning-block",
  },
] as const;

const AVAILABILITY_LEGEND = [
  {
    key: "available",
    label: "Beschikbaar",
    className: "bg-[color-mix(in_oklab,var(--success)_18%,white)]",
  },
  {
    key: "blocked",
    label: "Geblokkeerd",
    className:
      "bg-[color-mix(in_oklab,var(--danger)_12%,white)] [background-image:repeating-linear-gradient(135deg,color-mix(in_oklab,var(--danger)_26%,transparent)_0,color-mix(in_oklab,var(--danger)_26%,transparent)_2px,transparent_2px,transparent_7px)]",
  },
  { key: "closed", label: "Gesloten", className: "bg-muted/70" },
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
  vehicleId?: string | null;
};

type PositionedEvent = {
  event: PlanningBoardEvent;
  lane: number;
  laneCount: number;
};

type ResourceRow = {
  day: string;
  key: string;
  label: string;
  subtitle?: string;
  resourceId: string;
  href?: string;
  availabilityInstructorId?: string;
  dropInstructorId?: string;
  dropVehicleId?: string | null;
};

function timeLabel(slot: number): string {
  const minutes = START_HOUR * 60 + slot * SLOT_MINUTES;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function localSlotIso(day: string, slot: number): string {
  return `${day}T${timeLabel(slot)}:00`;
}

function resourceRowKey(
  day: string,
  perspective: PlanningBoardPerspective,
  resourceId: string | null | undefined,
): string {
  return `${day}|${perspective}|${resourceId || "none"}`;
}

function slotId(target: SlotTarget): string {
  return `slot|${target.day}|${target.instructorId}|${target.startsAt}|${target.vehicleId ?? ""}`;
}

function parseSlotId(value: string): SlotTarget | null {
  const [kind, day, instructorId, startsAt, vehicleId] = value.split("|");
  if (kind !== "slot" || !day || !instructorId || !startsAt) return null;
  return { day, instructorId, startsAt, vehicleId: vehicleId || null };
}

function eventDurationMinutes(event: PlanningBoardEvent): number {
  return Math.max(SLOT_MINUTES, event.occupiedMinutes ?? event.durationMinutes);
}

function eventTop(event: PlanningBoardEvent, timeZone: string): number {
  const minutes = zonedMinuteOfDay(new Date(event.startsAt), timeZone);
  return Math.max(
    0,
    ((minutes - START_HOUR * 60) / SLOT_MINUTES) * SLOT_HEIGHT,
  );
}

function eventLeft(event: PlanningBoardEvent, timeZone: string): string {
  const minutes = zonedMinuteOfDay(new Date(event.startsAt), timeZone);
  const percentage = ((minutes - START_HOUR * 60) / TIMELINE_MINUTES) * 100;
  return `${Math.max(0, percentage)}%`;
}

function eventHeight(event: PlanningBoardEvent): number {
  return Math.max(
    28,
    (eventDurationMinutes(event) / SLOT_MINUTES) * SLOT_HEIGHT - 4,
  );
}

function eventWidth(event: PlanningBoardEvent): string {
  return `${(eventDurationMinutes(event) / TIMELINE_MINUTES) * 100}%`;
}

function eventLaneStyle(lane: number, laneCount: number) {
  const availableHeight = RESOURCE_ROW_HEIGHT - 8;
  const laneHeight = availableHeight / Math.max(1, laneCount);
  return {
    top: 4 + lane * laneHeight,
    height: Math.max(18, laneHeight - 3),
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

function dateShort(day: string, timeZone: string): string {
  return createNlDateTimeFormatter(
    {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    },
    timeZone,
  ).format(startOfZonedDayUtc(day, timeZone));
}

function timeShort(value: string, timeZone: string): string {
  return createNlDateTimeFormatter(
    {
      hour: "2-digit",
      minute: "2-digit",
    },
    timeZone,
  ).format(new Date(value));
}

function perspectiveLabel(perspective: PlanningBoardPerspective): string {
  if (perspective === "branch") return "Vestiging";
  if (perspective === "vehicle") return "Voertuig";
  if (perspective === "exam") return "Examen";
  if (perspective === "trial_lesson") return "Proefles";
  return "Instructeur";
}

function perspectiveDescription(perspective: PlanningBoardPerspective): string {
  if (perspective === "branch") return "planning per vestiging";
  if (perspective === "vehicle") return "bezetting per voertuig";
  if (perspective === "exam") return "examen- en TTT-planning";
  if (perspective === "trial_lesson") return "proeflessen";
  return "planning per instructeur";
}

function instructorRowSubtitle(
  day: string,
  data: PlanningBoardData,
  perspective: PlanningBoardPerspective,
): string | undefined {
  const dayLabel =
    data.filters.view === "week" ? dateShort(day, data.timeZone) : undefined;
  if (perspective === "exam")
    return dayLabel ? `Examen / TTT - ${dayLabel}` : "Examen / TTT";
  if (perspective === "trial_lesson")
    return dayLabel ? `Proeflessen - ${dayLabel}` : "Proeflessen";
  return dayLabel;
}

function eventResourceId(
  event: PlanningBoardEvent,
  perspective: PlanningBoardPerspective,
): string {
  if (perspective === "branch") return event.branchId ?? "none";
  if (perspective === "vehicle") return event.vehicleId ?? "none";
  return event.instructorId;
}

function resourceRowsForDay(
  day: string,
  data: PlanningBoardData,
  perspective: PlanningBoardPerspective,
  events: readonly PlanningBoardEvent[],
): ResourceRow[] {
  if (
    perspective === "instructor" ||
    perspective === "exam" ||
    perspective === "trial_lesson"
  ) {
    return data.instructors.map((instructor) => ({
      day,
      key: resourceRowKey(day, perspective, instructor.id),
      label: instructor.name,
      subtitle: instructorRowSubtitle(day, data, perspective),
      resourceId: instructor.id,
      href: `/backoffice/planning-board/instructors/${instructor.id}?date=${day}&view=${data.filters.view}`,
      availabilityInstructorId: instructor.id,
      dropInstructorId: instructor.id,
    }));
  }

  if (perspective === "branch") {
    const branchIdsWithEvents = new Set(
      events
        .filter(
          (event) => zonedYmd(new Date(event.startsAt), data.timeZone) === day,
        )
        .map((event) => event.branchId ?? "none"),
    );
    const rows: ResourceRow[] = data.branches.map((branch) => ({
      day,
      key: resourceRowKey(day, perspective, branch.id),
      label: branch.label,
      subtitle: "Vestiging",
      resourceId: branch.id,
      dropInstructorId: data.filters.instructorId ?? undefined,
    }));
    if (branchIdsWithEvents.has("none")) {
      rows.push({
        day,
        key: resourceRowKey(day, perspective, "none"),
        label: "Geen vestiging",
        subtitle: "Ongekoppeld",
        resourceId: "none",
        dropInstructorId: data.filters.instructorId ?? undefined,
      });
    }
    return rows;
  }

  const vehicleIdsWithEvents = new Set(
    events
      .filter(
        (event) => zonedYmd(new Date(event.startsAt), data.timeZone) === day,
      )
      .map((event) => event.vehicleId ?? "none"),
  );
  const rows: ResourceRow[] = data.vehicles.map((vehicle) => ({
    day,
    key: resourceRowKey(day, perspective, vehicle.id),
    label: vehicle.label,
    subtitle: "Voertuig",
    resourceId: vehicle.id,
    dropInstructorId: data.filters.instructorId ?? undefined,
    dropVehicleId: vehicle.id,
  }));
  if (vehicleIdsWithEvents.has("none")) {
    rows.push({
      day,
      key: resourceRowKey(day, perspective, "none"),
      label: "Geen voertuig",
      subtitle: "Ongekoppeld",
      resourceId: "none",
      dropInstructorId: data.filters.instructorId ?? undefined,
      dropVehicleId: null,
    });
  }
  return rows;
}

function reasonText(validation: PlanningValidationResult | null): string[] {
  if (!validation) return [];
  return [...validation.blockingReasons, ...validation.warnings].map((reason) =>
    humanizePlanningMessage(formatPlanningReason(reason)),
  );
}

function dispatchAdviceText(
  validation: PlanningValidationResult | null,
): string | null {
  if (!validation) return null;
  const reasons = [...validation.blockingReasons, ...validation.warnings];
  const codes = new Set(reasons.map((reason) => reason.code));
  if (
    codes.has("INSUFFICIENT_TRAVEL_TIME_BEFORE") ||
    codes.has("INSUFFICIENT_TRAVEL_TIME_AFTER") ||
    codes.has("UNKNOWN_SERVICE_AREA_TRAVEL_TIME") ||
    codes.has("OUTSIDE_INSTRUCTOR_SERVICE_AREA")
  ) {
    return "Dispatchadvies: kies een leerling/lead dichter bij de vorige of volgende afspraak, of filter op hetzelfde rayon.";
  }
  if (
    codes.has("VEHICLE_HAS_OVERLAP") ||
    codes.has("VEHICLE_UNAVAILABLE") ||
    codes.has("VEHICLE_MAINTENANCE_BLOCK") ||
    codes.has("MISSING_REQUIRED_VEHICLE_CAPABILITY")
  ) {
    return "Dispatchadvies: kies een beschikbaar voertuig met passende transmissie en eigenschappen.";
  }
  if (
    codes.has("INSTRUCTOR_NOT_AVAILABLE") ||
    codes.has("INSTRUCTOR_HAS_OVERLAP") ||
    codes.has("MISSING_REQUIRED_CAPABILITY")
  ) {
    return "Dispatchadvies: kies een instructeur die beschikbaar is en de vereiste bevoegdheden/capabilities heeft.";
  }
  if (validation.allowed && validation.warnings.length === 0) {
    return "Dispatchadvies: dit slot past bij beschikbaarheid, conflictregels en planningcontext.";
  }
  return null;
}

function humanizePlanningMessage(message: string): string {
  if (
    message.includes("student branch does not match planning queue item branch")
  ) {
    return "Vestiging klopt niet: leerling en queue-item horen bij verschillende vestigingen.";
  }
  if (
    message.includes("Cannot access") &&
    message.includes("before initialization")
  ) {
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
    return "border-planning-lesson bg-planning-lesson text-foreground";
  }
  if (tone === "trial_lesson") {
    return "border-planning-trial bg-planning-trial text-foreground";
  }
  if (tone === "exam") {
    return "border-planning-exam bg-planning-exam text-foreground";
  }
  if (tone === "interim_test") {
    return "border-planning-ttt bg-planning-ttt text-foreground";
  }
  if (tone === "theory") {
    return "border-planning-theory bg-planning-theory text-foreground";
  }
  if (tone === "admin") {
    return "border-planning-admin bg-planning-admin text-foreground";
  }
  return "border-planning-block bg-planning-block text-foreground";
}

function eventAccentClass(event: PlanningBoardEvent): string {
  const tone = planningBoardEventTone(event);
  if (tone === "lesson") return "bg-blue-500";
  if (tone === "trial_lesson") return "bg-emerald-500";
  if (tone === "exam") return "bg-rose-500";
  if (tone === "interim_test") return "bg-violet-500";
  if (tone === "theory") return "bg-cyan-500";
  if (tone === "admin") return "bg-amber-500";
  return "bg-slate-500";
}

function eventTimeRange(event: PlanningBoardEvent, timeZone: string): string {
  return `${timeShort(event.startsAt, timeZone)} - ${timeShort(event.endsAt, timeZone)}`;
}

function queuePriorityLabel(
  priority: PlanningQueueListItem["priority"],
): string {
  if (priority === "urgent") return "Hoog";
  if (priority === "high") return "Hoog";
  if (priority === "low") return "Laag";
  return "Normaal";
}

function slotAvailability(
  blocks: readonly PlanningBoardAvailability[],
  day: string,
  slot: number,
  timeZone: string,
): "available" | "blocked" | "closed" {
  const start = START_HOUR * 60 + slot * SLOT_MINUTES;
  const end = start + SLOT_MINUTES;
  const weekday = zonedWeekdayIndex(
    startOfZonedDayUtc(day, timeZone),
    timeZone,
  );
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
    left: `${((start - timelineStart) / TIMELINE_MINUTES) * 100}%`,
    width: `${((end - start) / TIMELINE_MINUTES) * 100}%`,
  };
}

function AvailabilityBands({
  blocks,
  day,
  timeZone,
  availabilityFilter,
}: {
  blocks: readonly PlanningBoardAvailability[];
  day: string;
  timeZone: string;
  availabilityFilter?: "available" | "blocked" | null;
}) {
  const weekday = zonedWeekdayIndex(
    startOfZonedDayUtc(day, timeZone),
    timeZone,
  );
  const dayBlocks = blocks.filter(
    (block) => block.date === day || block.weekday === weekday,
  );
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className={cn(
          "absolute inset-0 bg-muted/45",
          availabilityFilter &&
            availabilityFilter !== "blocked" &&
            "opacity-40",
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
                ? "bg-[color-mix(in_oklab,var(--danger)_10%,white)] [background-image:repeating-linear-gradient(135deg,color-mix(in_oklab,var(--danger)_24%,transparent)_0,color-mix(in_oklab,var(--danger)_24%,transparent)_2px,transparent_2px,transparent_7px)]"
                : "bg-[color-mix(in_oklab,var(--success)_12%,white)]",
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
          <p className="truncate text-[13px] font-semibold leading-5 text-foreground">
            {title}
          </p>
          <p className="truncate text-[11px] leading-4 text-muted-foreground">
            {item.duration_minutes} min
            {item.required_transmission
              ? ` - ${item.required_transmission}`
              : ""}
            {item.service_area_name ? ` - ${item.service_area_name}` : ""}
          </p>
          {item.preferred_instructor_name || item.branch_name ? (
            <p className="truncate text-[11px] leading-4 text-muted-foreground">
              {item.preferred_instructor_name ?? item.branch_name}
            </p>
          ) : null}
        </div>
        <Badge
          variant={
            item.priority === "urgent" || item.priority === "high"
              ? "danger"
              : "outline"
          }
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
        >
          {queuePriorityLabel(item.priority)}
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
        "rounded-xl border border-border bg-[var(--surface-1)] text-sm shadow-sm transition-opacity hover:border-primary/30 hover:bg-[var(--admin-row-hover)]",
        compact ? "w-64 p-2 opacity-80" : "p-2.5",
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
  timeZone,
  detailed = false,
  layout = "calendar",
  lane = 0,
  laneCount = 1,
  onOpen,
}: {
  event: PlanningBoardEvent;
  timeZone: string;
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
          left: eventLeft(event, timeZone),
          width: eventWidth(event),
          ...eventLaneStyle(lane, laneCount),
        }
      : {
          top: eventTop(event, timeZone),
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
        "absolute overflow-hidden rounded-lg border bg-clip-padding text-[11px] shadow-sm ring-1 ring-white/45 transition-[border-color,transform,opacity]",
        layout === "calendar" && "left-1 right-1",
        layout === "timeline" && "min-w-11",
        eventTone(event),
        detailed && "text-xs",
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
      <span
        className={cn("absolute inset-y-0 left-0 w-1", eventAccentClass(event))}
        aria-hidden
      />
      <div
        className={cn(
          "min-w-0 px-2 pl-3",
          layout === "timeline" ? "py-1" : "py-1.5",
        )}
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="truncate text-[10px] font-semibold leading-3.5 text-muted-foreground">
            {eventTimeRange(event, timeZone)}
          </p>
          <span className="shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-semibold text-foreground/75">
            {planningBoardEventLabel(event)}
          </span>
        </div>
        <p className="truncate text-[11px] font-semibold leading-3.5 text-foreground">
          {event.title}
        </p>
        {layout !== "timeline" ? (
          <p className="truncate text-[10px] leading-4 text-muted-foreground">
            {[event.vehicleLabel, event.serviceAreaName]
              .filter(Boolean)
              .join(" - ") || event.subtitle}
          </p>
        ) : null}
        {detailed && layout !== "timeline" ? (
          <p className="truncate text-[10px] leading-4 text-muted-foreground">
            {event.durationMinutes} min
            {event.bufferMinutes ? ` + ${event.bufferMinutes} buffer` : ""}
            {event.status ? ` - ${event.status}` : ""}
          </p>
        ) : null}
      </div>
      {(event.warnings?.length ?? 0) > 0 ? (
        <span className="absolute bottom-1 right-1 rounded-full bg-warning px-1.5 py-0.5 text-[9px] font-semibold text-white">
          !
        </span>
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
  const slotPreviewText = isBlockedPreview ? "Niet planbaar" : previewText;
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
          ? { width: `${SLOT_PERCENT}%`, height: "100%" }
          : { height: SLOT_HEIGHT }
      }
      title={title}
      aria-label={title}
    >
      {slotPreviewText ? (
        <span
          className={cn(
            "pointer-events-none absolute left-1 top-1 max-w-[calc(100%-0.5rem)] truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            isBlockedPreview && "bg-danger/10 text-danger",
            isWarningPreview && "bg-warning/10 text-warning",
            preview?.validation?.allowed &&
              !isWarningPreview &&
              "bg-success/10 text-success",
          )}
        >
          {slotPreviewText}
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
  const [selectedEvent, setSelectedEvent] = useState<PlanningBoardEvent | null>(
    null,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(data.queueItems.length > 0);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lastPreviewTarget = useRef<string | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRequest = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const slotCount = SLOT_COUNT;
  const layoutMode = planningBoardLayoutMode(detailMode);
  const perspective = data.filters.perspective ?? "instructor";
  const readonlyResourcePerspective =
    (perspective === "branch" || perspective === "vehicle") &&
    !data.filters.instructorId;
  const previewReasons = reasonText(preview?.validation ?? null);
  const previewMessage = preview?.message ?? null;
  const dispatchAdvice = dispatchAdviceText(preview?.validation ?? null);
  const previewIsBlocked = Boolean(preview && !preview.validation?.allowed);
  const previewStatus = status && status !== previewMessage ? status : null;
  const activeFilterCount = [
    data.filters.branchId,
    data.filters.appointmentType,
    data.filters.serviceAreaId,
    data.filters.instructorId,
    data.filters.transmission,
    data.filters.capabilityId,
    data.filters.vehicleId,
    data.filters.availability,
    data.filters.conflictsOnly ? "conflicts" : null,
    data.filters.status && data.filters.status !== "open"
      ? data.filters.status
      : null,
  ].filter(Boolean).length;
  const visibleDays = useMemo(() => {
    if (data.filters.view === "week" || layoutMode === "instructor_timeline") {
      return data.days;
    }
    return [data.filters.date];
  }, [data.days, data.filters.date, data.filters.view, layoutMode]);
  const rows = useMemo(
    () =>
      visibleDays.flatMap((day) =>
        resourceRowsForDay(day, data, perspective, events),
      ),
    [visibleDays, data, perspective, events],
  );
  const eventsByRow = useMemo(() => {
    const map = new Map<string, PlanningBoardEvent[]>();
    for (const event of events) {
      const day = zonedYmd(new Date(event.startsAt), data.timeZone);
      const key = resourceRowKey(
        day,
        perspective,
        eventResourceId(event, perspective),
      );
      const bucket = map.get(key) ?? [];
      bucket.push(event);
      map.set(key, bucket);
    }
    return map;
  }, [events, perspective, data.timeZone]);
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
  const boardStats = useMemo(() => {
    const daySet = new Set(visibleDays);
    const visibleEvents = events.filter((event) =>
      daySet.has(zonedYmd(new Date(event.startsAt), data.timeZone)),
    );
    return {
      eventCount: visibleEvents.length,
      lessonCount: visibleEvents.filter(
        (event) => event.entityType === "lesson",
      ).length,
      trialCount: visibleEvents.filter(
        (event) => event.entityType === "trial_lesson",
      ).length,
      warningCount: visibleEvents.reduce(
        (count, event) => count + (event.warnings?.length ?? 0),
        0,
      ),
      queueCount: queueItems.length,
    };
  }, [events, queueItems.length, visibleDays, data.timeZone]);

  function clearPreviewTimer() {
    if (!previewTimer.current) return;
    clearTimeout(previewTimer.current);
    previewTimer.current = null;
  }

  useEffect(() => {
    return () => clearPreviewTimer();
  }, []);

  useEffect(() => {
    if (!filtersOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [filtersOpen]);

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
                  vehicleId: target.vehicleId ?? (selectedVehicleId || null),
                })
              : await previewBoardEventMoveAction({
                  entityType: payload.entityType,
                  entityId: payload.id,
                  instructorId: target.instructorId,
                  startsAt: target.startsAt,
                  vehicleId: target.vehicleId ?? (selectedVehicleId || null),
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
    setToolsOpen(true);
    startTransition(async () => {
      setStatus("Planning wordt gecontroleerd...");
      const result =
        payload.kind === "queue"
          ? await scheduleQueueDropAction({
              queueItemId: payload.id,
              instructorId: target.instructorId,
              startsAt: target.startsAt,
              vehicleId: target.vehicleId ?? (selectedVehicleId || null),
            })
          : await rescheduleBoardEventAction({
              entityType: payload.entityType,
              entityId: payload.id,
              instructorId: target.instructorId,
              startsAt: target.startsAt,
              vehicleId: target.vehicleId ?? (selectedVehicleId || null),
            });
      if (!result.ok) {
        setStatus("Niet ingepland.");
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
                  vehicleId:
                    target.vehicleId ?? (selectedVehicleId || item.vehicleId),
                  endsAt: new Date(
                    (parseZonedDateTime(
                      target.startsAt,
                      data.timeZone,
                    )?.getTime() ?? Date.now()) +
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
        setStatus("Niet ingepland.");
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
      <div
        className={cn(
          "grid gap-3",
          toolsOpen && "xl:grid-cols-[minmax(0,1fr)_18rem]",
        )}
      >
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-[var(--surface-1)] shadow-sm">
          <div className="border-b border-border bg-[var(--surface-1)] px-3 py-2.5">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(true)}
                    className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Weergave en perspectief wijzigen"
                  >
                    {data.filters.view === "week" ? "Week" : "Dag"} -{" "}
                    {perspectiveLabel(perspective)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(true)}
                    className="rounded-full border border-border bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Planboarddatum wijzigen"
                  >
                    {dateShort(data.filters.date, data.timeZone)}
                  </button>
                </div>
                <div className="flex max-w-full divide-x divide-border overflow-x-auto rounded-lg border border-border bg-[var(--surface-2)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {[
                    ["Afspraken", boardStats.eventCount],
                    ["Rijlessen", boardStats.lessonCount],
                    ["Proeflessen", boardStats.trialCount],
                    ["Queue", boardStats.queueCount],
                    ["Signalen", boardStats.warningCount],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex shrink-0 items-baseline gap-1.5 px-2.5 py-1.5"
                    >
                      <span className="text-sm font-semibold leading-none text-foreground">
                        {value}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground lg:flex-none">
                  <Car className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <Select
                    value={selectedVehicleId}
                    onChange={(event) =>
                      setSelectedVehicleId(event.target.value)
                    }
                    aria-label="Voertuig voor nieuwe planning"
                    className="h-8 min-w-44 flex-1 text-xs lg:w-52"
                  >
                    <option value="">Automatisch/geen voertuig</option>
                    {data.vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setFiltersOpen((current) => !current)}
                    aria-haspopup="dialog"
                    aria-expanded={filtersOpen}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                    Filters
                    {activeFilterCount > 0 ? (
                      <Badge className="ml-0.5 rounded-full px-1.5 py-0 text-[9px]">
                        {activeFilterCount}
                      </Badge>
                    ) : null}
                  </Button>
                  {filtersOpen && filterForm ? (
                    <>
                      <button
                        type="button"
                        aria-label="Filters sluiten"
                        className="fixed inset-0 z-40 cursor-default bg-slate-950/10 backdrop-blur-[1px]"
                        onClick={() => setFiltersOpen(false)}
                      />
                      <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="planboard-filter-title"
                        className="fixed inset-x-3 bottom-3 top-20 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-[var(--surface-1)] shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:max-h-[calc(100vh-8rem)] sm:w-[23rem]"
                      >
                        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                          <div>
                            <p
                              id="planboard-filter-title"
                              className="text-sm font-semibold text-foreground"
                            >
                              Planboardfilters
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Pas alleen de relevante doorsnede toe.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFiltersOpen(false)}
                            aria-label="Filters sluiten"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <X className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-4">
                          {filterForm}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant={toolsOpen ? "secondary" : "outline"}
                  size="sm"
                  className="h-8"
                  onClick={() => setToolsOpen((current) => !current)}
                  aria-expanded={toolsOpen}
                  aria-controls="planboard-tools"
                >
                  {toolsOpen ? (
                    <PanelRightClose className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Queue
                  <Badge
                    variant="outline"
                    className="rounded-full px-1.5 py-0 text-[9px]"
                  >
                    {queueItems.length}
                  </Badge>
                </Button>
              </div>
            </div>
            <div className="mt-2 flex gap-2.5 overflow-x-auto text-[10px] text-muted-foreground [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/25 [&::-webkit-scrollbar-track]:bg-transparent">
              {EVENT_LEGEND.map((item) => (
                <span
                  key={item.key}
                  className="flex shrink-0 items-center gap-1.5"
                >
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-sm border",
                      item.className,
                    )}
                  />
                  {item.label}
                </span>
              ))}
              <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
              {AVAILABILITY_LEGEND.map((item) => (
                <span
                  key={item.key}
                  className="flex shrink-0 items-center gap-1.5"
                >
                  <span
                    className={cn(
                      "h-2.5 w-5 rounded-sm border border-border/60",
                      item.className,
                    )}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="max-h-[calc(100vh-13rem)] min-h-[28rem] overflow-auto [scrollbar-color:color-mix(in_oklab,var(--primary)_34%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/25 [&::-webkit-scrollbar-track]:bg-transparent">
            <div
              className="w-full"
              style={{
                minWidth: RESOURCE_COLUMN_WIDTH + slotCount * SLOT_WIDTH,
              }}
            >
              <div
                className="sticky top-0 z-30 grid border-b border-border bg-[var(--surface-2)]"
                style={{
                  gridTemplateColumns: `${RESOURCE_COLUMN_WIDTH}px minmax(0, 1fr)`,
                }}
              >
                <div className="sticky left-0 z-40 border-r border-[var(--admin-grid-line)] bg-[var(--surface-2)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {perspectiveLabel(perspective)}
                </div>
                <div className="flex bg-[var(--surface-2)]">
                  {Array.from({ length: slotCount }, (_, slot) => (
                    <div
                      key={slot}
                      className={cn(
                        "shrink-0 border-l border-[var(--admin-grid-line)] px-2 py-1.5 text-[10px] font-semibold text-muted-foreground",
                        slot % 2 === 0 && "text-foreground",
                      )}
                      style={{ width: `${SLOT_PERCENT}%` }}
                    >
                      {slot % 2 === 0 ? timeLabel(slot) : ""}
                    </div>
                  ))}
                </div>
              </div>
              {rows.map((row) => {
                const rowEvents = layoutOverlappingEvents(
                  eventsByRow.get(row.key) ?? [],
                );
                const blocks = row.availabilityInstructorId
                  ? (availabilityByInstructor.get(
                      row.availabilityInstructorId,
                    ) ?? [])
                  : [];
                return (
                  <div
                    key={row.key}
                    className="grid border-b border-[var(--admin-grid-line)]"
                    style={{
                      height: RESOURCE_ROW_HEIGHT,
                      gridTemplateColumns: `${RESOURCE_COLUMN_WIDTH}px minmax(0, 1fr)`,
                    }}
                  >
                    <div className="sticky left-0 z-20 flex min-w-0 flex-col justify-center border-r border-[var(--admin-grid-line)] bg-[var(--surface-1)] px-3">
                      {row.href ? (
                        <Link
                          href={row.href}
                          className="truncate text-xs font-semibold text-foreground hover:text-primary"
                        >
                          {row.label}
                        </Link>
                      ) : (
                        <span className="truncate text-xs font-semibold text-foreground">
                          {row.label}
                        </span>
                      )}
                      <span className="truncate text-[10px] text-muted-foreground">
                        {row.subtitle ?? perspectiveDescription(perspective)}
                      </span>
                    </div>
                    <div className="relative flex">
                      {row.availabilityInstructorId ? (
                        <AvailabilityBands
                          blocks={blocks}
                          day={row.day}
                          timeZone={data.timeZone}
                          availabilityFilter={data.filters.availability}
                        />
                      ) : (
                        <div className="pointer-events-none absolute inset-0 bg-muted/20" />
                      )}
                      {Array.from({ length: slotCount }, (_, slot) => {
                        const startsAt = localSlotIso(row.day, slot);
                        if (!row.dropInstructorId) {
                          return (
                            <div
                              key={slot}
                              className="relative shrink-0 border-r border-border/45"
                              style={{
                                width: `${SLOT_PERCENT}%`,
                                height: "100%",
                              }}
                              title={`${perspectiveDescription(perspective)} - alleen lezen`}
                            />
                          );
                        }
                        const target = {
                          day: row.day,
                          instructorId: row.dropInstructorId,
                          startsAt,
                          vehicleId: row.dropVehicleId,
                        };
                        const targetId = slotId(target);
                        return (
                          <DroppableSlot
                            key={slot}
                            target={target}
                            availability={
                              row.availabilityInstructorId
                                ? slotAvailability(
                                    blocks,
                                    row.day,
                                    slot,
                                    data.timeZone,
                                  )
                                : "available"
                            }
                            availabilityFilter={
                              row.availabilityInstructorId
                                ? data.filters.availability
                                : null
                            }
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
                          timeZone={data.timeZone}
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

        {toolsOpen ? (
          <aside
            id="planboard-tools"
            className="min-w-0 space-y-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1 [scrollbar-color:color-mix(in_oklab,var(--primary)_34%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/25 [&::-webkit-scrollbar-track]:bg-transparent"
          >
            <Card className="border-border shadow-sm">
              <CardHeader className="px-3 pb-1.5 pt-3">
                <CardTitle className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4" aria-hidden />
                    Planning queue
                  </span>
                  <Badge variant="outline" className="rounded-full">
                    {queueItems.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-80 space-y-2 overflow-y-auto px-3 pb-3 pr-3 [scrollbar-color:color-mix(in_oklab,var(--primary)_34%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/25 [&::-webkit-scrollbar-track]:bg-transparent">
                {queueItems.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border bg-[var(--surface-2)] px-3 py-4 text-sm text-muted-foreground">
                    Geen open items in de planning queue.
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
                          className="grid gap-2 rounded-xl border border-border bg-[var(--surface-2)] p-2 md:hidden"
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
                          <Input
                            name="starts_at"
                            type="datetime-local"
                            required
                          />
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

            <Card className="border-border shadow-sm">
              <CardHeader className="px-3 pb-1.5 pt-3">
                <CardTitle className="text-sm">
                  {previewIsBlocked ? "Planningcontrole" : "Planning assistent"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-3 pb-3 text-sm">
                {pending ? (
                  <p className="rounded-xl border border-border bg-[var(--surface-2)] px-3 py-2 text-muted-foreground">
                    Slot controleren...
                  </p>
                ) : null}
                {previewStatus ? (
                  <p className="rounded-xl border border-border bg-[var(--surface-2)] px-3 py-2 text-muted-foreground">
                    {previewStatus}
                  </p>
                ) : null}
                {preview?.validation?.allowed ? (
                  <div className="flex items-center gap-2 rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-success">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Toegestaan volgens planningregels.
                  </div>
                ) : preview ? (
                  <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-danger">
                    <div className="flex items-center gap-2 font-semibold">
                      <AlertCircle className="h-4 w-4" aria-hidden />
                      Niet ingepland
                    </div>
                    <p className="mt-1 text-xs leading-relaxed">
                      {previewMessage ?? "Deze drop is geblokkeerd."}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-danger/80">
                      Dit is alleen een preview. Er is niets opgeslagen in de
                      agenda.
                    </p>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-border bg-[var(--surface-2)] px-3 py-4 text-muted-foreground">
                    {readonlyResourcePerspective
                      ? "Kies een instructeur om vanuit dit perspectief te plannen."
                      : "Sleep een queue-item of afspraak naar een slot voor validatie."}
                  </p>
                )}
                {previewReasons
                  .filter((reason) => reason !== previewMessage)
                  .map((reason) => (
                    <p
                      key={reason}
                      className="rounded-xl bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground"
                    >
                      {reason}
                    </p>
                  ))}
                {dispatchAdvice ? (
                  <div className="rounded-xl border border-primary/20 bg-primary-soft px-3 py-2 text-xs leading-5 text-primary">
                    {dispatchAdvice}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </aside>
        ) : null}
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
                {timeShort(selectedEvent.startsAt, data.timeZone)} -{" "}
                {timeShort(selectedEvent.endsAt, data.timeZone)} (
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
