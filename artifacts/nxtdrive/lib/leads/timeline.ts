import {
  LEAD_EVENT_LABEL,
  LEAD_STATUS_LABEL,
  type LeadEvent,
  type LeadEventType,
  type LeadStatus,
} from "@/lib/leads/types";

// ---------------------------------------------------------------------------
// Pure timeline rendering helpers (Task #54). Turn an insert-only lead_event
// into a human Dutch sentence for the lead detail timeline. No I/O.
// ---------------------------------------------------------------------------

function asStatus(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return LEAD_STATUS_LABEL[value as LeadStatus] ?? value;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export type TimelineEntry = {
  id: string;
  type: LeadEventType;
  label: string;
  detail: string | null;
  createdAt: string;
};

export function describeLeadEvent(event: LeadEvent): TimelineEntry {
  const p = event.payload ?? {};
  let detail: string | null = null;

  switch (event.event_type) {
    case "status_changed": {
      const from = asStatus(p["from"]);
      const to = asStatus(p["to"]);
      if (from && to) detail = `${from} → ${to}`;
      else if (to) detail = to;
      break;
    }
    case "note":
      detail = str(p["note"]) ?? str(p["text"]);
      break;
    case "lost":
      detail = str(p["reason"]);
      break;
    case "follow_up_scheduled": {
      const at = str(p["next_action_at"]);
      detail = at ? `Gepland voor ${new Date(at).toLocaleString("nl-NL")}` : null;
      break;
    }
    case "score_updated": {
      const from = p["from"];
      const to = p["to"];
      if (typeof from === "number" && typeof to === "number") {
        detail = `${from} → ${to}`;
      }
      break;
    }
    case "task_auto_created":
    case "task_completed":
      detail = str(p["title"]);
      break;
    case "created":
      detail = str(p["source"]);
      break;
    default:
      detail = str(p["reason"]) ?? str(p["note"]);
  }

  return {
    id: event.id,
    type: event.event_type,
    label: LEAD_EVENT_LABEL[event.event_type] ?? event.event_type,
    detail,
    createdAt: event.created_at,
  };
}

export function describeLeadEvents(events: LeadEvent[]): TimelineEntry[] {
  return events.map(describeLeadEvent);
}
