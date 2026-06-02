// ---------------------------------------------------------------------------
// Fase 1B — Intake-analyse (app layer).
//
// The pure, deterministic scoring/advice engine lives in the shared
// @workspace/leads-analysis lib (so it can be unit-tested from
// @workspace/scripts without dragging in Next.js). This module re-exports it
// and adds the app-only pieces that depend on the tasks domain
// (TaskPriority) — the attention-point → Kanban task templates.
// ---------------------------------------------------------------------------

import {
  type IntakeAttentionPoint,
} from "@workspace/leads-analysis";
import { type TaskPriority } from "@/lib/tasks/types";
import {
  INTAKE_DAYPART_LABEL,
  INTAKE_WEEKDAY_LABEL,
  type IntakeDaypart,
  type IntakeWeekday,
} from "./types";

export * from "@workspace/leads-analysis";

// --- Attention point → backoffice task -------------------------------------
//
// Turns an attention point into a ready-made, actionable Kanban task. Titles
// deliberately contain the domain keyword (e.g. "CBR-machtiging") so the
// tenant's task-assignment rules can route the task to the right department.
// Unknown/future codes fall back to the point's own label so nothing is lost.

type AttentionTaskTemplate = {
  /** Built with the lead name so the card is self-explanatory on the board. */
  title: (leadName: string) => string;
  description: string;
  priority: TaskPriority;
};

const INTAKE_ATTENTION_TASK: Record<string, AttentionTaskTemplate> = {
  no_experience: {
    title: (n) => `Extra begeleiding plannen: ${n}`,
    description:
      "Beginnend bestuurder zonder rijervaring — plan extra begeleiding en een rustige opbouw.",
    priority: "normal",
  },
  failed_exam_before: {
    title: (n) => `Herexamen-aanpak bespreken: ${n}`,
    description:
      "Leerling heeft eerder examen gedaan — bespreek de herexamen-aanpak en aandachtspunten.",
    priority: "high",
  },
  theory_missing: {
    title: (n) => `Theorie herinneren: ${n}`,
    description:
      "Theorie is nog niet gehaald — herinner de leerling aan het theorie-examen en lesmateriaal.",
    priority: "high",
  },
  health_declaration_missing: {
    title: (n) => `Gezondheidsverklaring regelen: ${n}`,
    description:
      "Gezondheidsverklaring is nog niet geregeld — help de leerling deze bij het CBR aan te vragen.",
    priority: "normal",
  },
  cbr_authorization_missing: {
    title: (n) => `CBR-machtiging regelen: ${n}`,
    description:
      "CBR-machtiging is nog niet geregeld — vraag de leerling de rijschool te machtigen in MijnCBR.",
    priority: "normal",
  },
  anxious_student: {
    title: (n) => `Rustige aanpak afstemmen: ${n}`,
    description:
      "Leerling geeft faalangst/onzekerheid aan — stem een rustige planning en aanpak af.",
    priority: "high",
  },
  fast_track: {
    title: (n) => `Snel traject inplannen: ${n}`,
    description:
      "Leerling wil een snel traject — plan een hogere lesfrequentie in.",
    priority: "normal",
  },
  limited_availability: {
    title: (n) => `Beschikbaarheid afstemmen: ${n}`,
    description:
      "Beperkte beschikbaarheid — stem de planning vroeg af om vertraging te voorkomen.",
    priority: "normal",
  },
};

/**
 * Build the task (title/description/priority) for an attention point. Falls back
 * to the point's own label + a points-based priority for unmapped codes.
 */
export function intakeAttentionTask(
  point: IntakeAttentionPoint,
  leadName: string,
): { title: string; description: string; priority: TaskPriority } {
  const tpl = INTAKE_ATTENTION_TASK[point.code];
  if (tpl) {
    return {
      title: tpl.title(leadName),
      description: tpl.description,
      priority: tpl.priority,
    };
  }
  return {
    title: `${point.label}: ${leadName}`,
    description: point.label,
    priority: point.points >= 3 ? "high" : "normal",
  };
}

// Re-exported so the UI can render preferred day/time labels alongside analysis
// without importing both modules separately.
export {
  INTAKE_DAYPART_LABEL,
  INTAKE_WEEKDAY_LABEL,
  type IntakeDaypart,
  type IntakeWeekday,
};
