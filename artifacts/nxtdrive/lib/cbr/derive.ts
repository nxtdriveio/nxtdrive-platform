// ---------------------------------------------------------------------------
// CBR Fase 1 — afgeleide examen-/toetsstatus (Module 13).
//
// De canon-statussen "examen gepland", "toets gepland", "geslaagd", "gezakt"
// en "herexamen nodig" worden NIET apart opgeslagen — ze volgen deterministisch
// uit de agenda-afspraken (examen/TTT) plus de vastgelegde uitslag. Deze pure
// functie is de enige bron van die afleiding zodat backoffice, instructeur en
// leerling exact dezelfde status zien.
// ---------------------------------------------------------------------------

import type { AgendaAppointment, AgendaAppointmentResult } from "@/lib/agenda/types";

// Canon-statussen (Module 13, Fase 1): examen gepland, geslaagd, gezakt. De
// extra waarden (toets_gepland/afgerond/geen) dekken de tussentijdse toets en de
// lege begintoestand. Een afgerond examen heeft altijd een uitslag (de RPC
// set_appointment_result vereist die), dus er bestaat geen "examen afgerond
// zonder uitslag" — examen_gepland gaat direct over in geslaagd of gezakt.
export type CbrExamStatus =
  | "geen" // nog geen examen-/toetsactiviteit
  | "toets_gepland" // toekomstige geplande tussentijdse toets (geen examen)
  | "examen_gepland" // toekomstig gepland examen
  | "afgerond" // afgeronde toets, (nog) geen examen gepland of behaald
  | "geslaagd" // laatste afgeronde examen behaald
  | "gezakt"; // laatste afgeronde examen gezakt, geen nieuw examen gepland

export const CBR_EXAM_STATUS_LABEL: Record<CbrExamStatus, string> = {
  geen: "Nog geen examen",
  toets_gepland: "Toets gepland",
  examen_gepland: "Examen gepland",
  afgerond: "Toets afgerond",
  geslaagd: "Geslaagd",
  gezakt: "Gezakt — herexamen nodig",
};

export type CbrStatusTone =
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "danger";

export const CBR_EXAM_STATUS_TONE: Record<CbrExamStatus, CbrStatusTone> = {
  geen: "neutral",
  toets_gepland: "info",
  examen_gepland: "info",
  afgerond: "warning",
  geslaagd: "success",
  gezakt: "danger",
};

/** Minimale afspraak-invoer voor de afleiding (alleen examen/TTT relevant). */
export type CbrAppointmentInput = {
  type: "exam" | "interim_test";
  status: "planned" | "completed" | "cancelled";
  starts_at: string;
  result: AgendaAppointmentResult | null;
};

export type CbrDerivedStatus = {
  examStatus: CbrExamStatus;
  /** Uitslag van het laatst afgeronde examen (niet de toets). */
  lastExamResult: AgendaAppointmentResult | null;
  /** Datum van het laatst afgeronde examen met uitslag, indien aanwezig. */
  lastExamAt: string | null;
  /** Eerstvolgende geplande examen, indien aanwezig. */
  nextExamAt: string | null;
  /** Eerstvolgende geplande tussentijdse toets, indien aanwezig. */
  nextToetsAt: string | null;
  /** Eerstvolgende geplande examen óf toets (wat het eerst komt). */
  nextAppointmentAt: string | null;
  nextAppointmentType: "exam" | "interim_test" | null;
};

/** Map een volledige agenda-afspraak naar de minimale afleidings-invoer. */
export function toCbrAppointmentInput(
  a: Pick<AgendaAppointment, "type" | "status" | "starts_at" | "result">,
): CbrAppointmentInput | null {
  if (a.type !== "exam" && a.type !== "interim_test") return null;
  return {
    type: a.type,
    status: a.status,
    starts_at: a.starts_at,
    result: a.result,
  };
}

/**
 * Leidt de examen-/toetsstatus af uit de afspraken. Precedentie (hoogste eerst):
 *  1. geslaagd        — laatst afgeronde examen behaald (terminale succesfase)
 *  2. examen_gepland  — er staat een examen in de toekomst gepland
 *  3. toets_gepland   — er staat een TTT in de toekomst gepland (geen examen)
 *  4. gezakt          — laatst afgeronde examen gezakt, geen nieuw examen gepland
 *  5. afgerond        — een afgeronde toets bestaat, verder niets
 *  6. geen            — geen enkele relevante afspraak
 *
 * NB: `lastExamResult`/`lastExamAt` blijven gevuld zodra er een afgerond examen
 * met uitslag is — óók als de kop op `examen_gepland` staat (herexamen ingepland
 * na zakken). De UI toont de laatste uitslag + vervolgadvies onafhankelijk van
 * de voorwaartse kopstatus, zodat de leerling de uitslag nooit kwijtraakt.
 */
export function deriveCbrExamStatus(
  appointments: CbrAppointmentInput[],
  now: Date = new Date(),
): CbrDerivedStatus {
  const nowMs = now.getTime();
  const ts = (s: string): number => Date.parse(s);

  const futurePlanned = appointments
    .filter((a) => a.status === "planned" && ts(a.starts_at) >= nowMs)
    .sort((a, b) => ts(a.starts_at) - ts(b.starts_at));
  const futureExam = futurePlanned.find((a) => a.type === "exam") ?? null;
  const futureToets =
    futurePlanned.find((a) => a.type === "interim_test") ?? null;

  const lastCompletedExam =
    appointments
      .filter(
        (a) =>
          a.type === "exam" && a.status === "completed" && a.result != null,
      )
      .sort((a, b) => ts(b.starts_at) - ts(a.starts_at))[0] ?? null;

  const lastCompletedToets =
    appointments
      .filter((a) => a.type === "interim_test" && a.status === "completed")
      .sort((a, b) => ts(b.starts_at) - ts(a.starts_at))[0] ?? null;

  let examStatus: CbrExamStatus;
  if (lastCompletedExam?.result === "passed") {
    examStatus = "geslaagd";
  } else if (futureExam) {
    examStatus = "examen_gepland";
  } else if (futureToets) {
    examStatus = "toets_gepland";
  } else if (lastCompletedExam?.result === "failed") {
    examStatus = "gezakt";
  } else if (lastCompletedToets) {
    examStatus = "afgerond";
  } else {
    examStatus = "geen";
  }

  const next = futurePlanned[0] ?? null;

  return {
    examStatus,
    lastExamResult: lastCompletedExam?.result ?? null,
    lastExamAt: lastCompletedExam?.starts_at ?? null,
    nextExamAt: futureExam?.starts_at ?? null,
    nextToetsAt: futureToets?.starts_at ?? null,
    nextAppointmentAt: next?.starts_at ?? null,
    nextAppointmentType: next?.type ?? null,
  };
}
