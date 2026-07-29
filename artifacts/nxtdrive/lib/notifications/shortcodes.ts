/**
 * Shortcode-catalogus voor e-mail/in-app/push-notificatietemplates.
 *
 * Per event_key een lijst van beschikbare shortcodes met Nederlandse labels
 * en voorbeeldwaarden (voor de preview-renderer). Het centrale object wordt
 * gebruikt door de platform-admin template-editor én door de backend-
 * interpolatie — one source of truth voor variabelen.
 *
 * Shortcodes worden ingevoegd als {{code}} in templates en geïnterpoleerd
 * door de `interpolate()` functie in templates.ts.
 */

import type { NotificationType } from "./types";

export type ShortcodeDef = {
  code: string;
  label: string;
  example: string;
};

/** Algemene shortcodes die in elk template beschikbaar zijn. */
export const COMMON_SHORTCODES: ShortcodeDef[] = [
  {
    code: "tenant_name",
    label: "Rijschoolnaam",
    example: "NXTDRIVE Demo Academy",
  },
];

/** Per event_key de beschikbare shortcodes (exclusief tenant_name). */
const CATALOG: Partial<Record<NotificationType, ShortcodeDef[]>> = {
  payment_confirmation: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    { code: "invoice_no", label: "Factuurnummer", example: "1042" },
    { code: "amount", label: "Bedrag", example: "€ 350,00" },
    {
      code: "paid_at",
      label: "Betaaldatum/-tijd",
      example: "di 3 jun 2026 14:22",
    },
  ],

  lesson_reminder: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    {
      code: "lesson_time",
      label: "Tijdstip les",
      example: "wo 10 jun 2026 14:00",
    },
    { code: "location", label: "Locatie", example: "Stationsplein 1, Utrecht" },
    {
      code: "instructor_name",
      label: "Instructeursnaam",
      example: "Sofie Bakker",
    },
  ],

  task_assigned: [
    { code: "assignee_name", label: "Naam ontvanger", example: "Sofie Bakker" },
    { code: "task_title", label: "Taaknaam", example: "Intake opvolgen" },
    { code: "board_name", label: "Bordnaam", example: "Leads" },
    { code: "department_name", label: "Afdeling", example: "Administratie" },
    { code: "priority", label: "Prioriteit", example: "Hoog" },
    { code: "due_date", label: "Deadline", example: "15 juni 2026" },
    {
      code: "task_url",
      label: "URL naar taak",
      example: "https://nxtdrive.io/backoffice/taken",
    },
  ],

  trial_lesson_received: [
    { code: "lead_name", label: "Naam prospect", example: "Lotte Smit" },
    {
      code: "lesson_time",
      label: "Gewenste tijd",
      example: "za 14 jun 2026 10:00",
    },
    { code: "location", label: "Voorkeurslocatie", example: "Utrecht centrum" },
  ],

  trial_lesson_confirmed: [
    { code: "lead_name", label: "Naam prospect", example: "Lotte Smit" },
    {
      code: "lesson_time",
      label: "Tijdstip proefles",
      example: "za 14 jun 2026 10:00",
    },
    { code: "location", label: "Locatie", example: "Stationsplein 1, Utrecht" },
    {
      code: "instructor_name",
      label: "Instructeursnaam",
      example: "Sofie Bakker",
    },
  ],

  lesson_refill_invitation: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    {
      code: "lesson_time",
      label: "Vrijgekomen moment",
      example: "ma 9 jun 2026 09:00",
    },
    { code: "location", label: "Locatie", example: "Stationsplein 1, Utrecht" },
    {
      code: "instructor_name",
      label: "Instructeursnaam",
      example: "Sofie Bakker",
    },
    {
      code: "expires_at",
      label: "Vervaldatum uitnodiging",
      example: "ma 9 jun 2026 18:00",
    },
  ],

  lesson_refill_confirmed: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    {
      code: "lesson_time",
      label: "Tijdstip les",
      example: "ma 9 jun 2026 09:00",
    },
    { code: "location", label: "Locatie", example: "Stationsplein 1, Utrecht" },
    {
      code: "instructor_name",
      label: "Instructeursnaam",
      example: "Sofie Bakker",
    },
  ],

  payment_reminder: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    { code: "invoice_no", label: "Factuurnummer", example: "1042" },
    { code: "amount", label: "Bedrag", example: "€ 350,00" },
    { code: "due_date", label: "Vervaldatum", example: "1 juni 2026" },
    { code: "days_overdue", label: "Dagen achterstallig", example: "7" },
  ],

  exam_invitation: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    { code: "exam_type", label: "Type (examen/TTT)", example: "examen" },
    { code: "exam_time", label: "Tijdstip", example: "do 19 jun 2026 10:00" },
    { code: "location", label: "Locatie", example: "CBR Rijswijk" },
    {
      code: "instructor_name",
      label: "Instructeursnaam",
      example: "Sofie Bakker",
    },
    {
      code: "expires_at",
      label: "Vervaldatum uitnodiging",
      example: "ma 16 jun 2026 18:00",
    },
  ],

  exam_confirmed: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    { code: "exam_type", label: "Type", example: "examen" },
    { code: "exam_time", label: "Tijdstip", example: "do 19 jun 2026 10:00" },
    { code: "location", label: "Locatie", example: "CBR Rijswijk" },
    {
      code: "instructor_name",
      label: "Instructeursnaam",
      example: "Sofie Bakker",
    },
  ],

  exam_planned: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    { code: "exam_type", label: "Type", example: "examen" },
    { code: "exam_time", label: "Tijdstip", example: "do 19 jun 2026 10:00" },
    { code: "location", label: "Locatie", example: "CBR Rijswijk" },
    {
      code: "instructor_name",
      label: "Instructeursnaam",
      example: "Sofie Bakker",
    },
  ],

  exam_passed: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    { code: "exam_type", label: "Type", example: "examen" },
  ],

  exam_failed: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    { code: "exam_type", label: "Type", example: "examen" },
  ],

  intake_received: [
    { code: "lead_name", label: "Naam prospect", example: "Lotte Smit" },
  ],

  lesson_cancelled: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    {
      code: "lesson_time",
      label: "Tijdstip les",
      example: "wo 10 jun 2026 14:00",
    },
    { code: "location", label: "Locatie", example: "Stationsplein 1, Utrecht" },
    {
      code: "instructor_name",
      label: "Instructeursnaam",
      example: "Sofie Bakker",
    },
  ],

  invoice_created: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    { code: "invoice_no", label: "Factuurnummer", example: "1042" },
    { code: "amount", label: "Bedrag", example: "€ 350,00" },
    { code: "due_date", label: "Vervaldatum", example: "30 juni 2026" },
  ],

  cbr_authorization_needed: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
  ],

  credit_low: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    { code: "remaining_minutes", label: "Resterende minuten", example: "45" },
    { code: "remaining_hours", label: "Resterende uren", example: "0,75 uur" },
  ],

  installment_due: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    { code: "invoice_no", label: "Factuurnummer", example: "1042" },
    { code: "amount", label: "Bedrag termijn", example: "€ 116,67" },
    { code: "due_date", label: "Vervaldatum", example: "15 juni 2026" },
  ],

  exam_day_reminder: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    { code: "exam_type", label: "Type", example: "examen" },
    { code: "exam_time", label: "Tijdstip", example: "do 19 jun 2026 10:00" },
    { code: "location", label: "Locatie", example: "CBR Rijswijk" },
    {
      code: "instructor_name",
      label: "Instructeursnaam",
      example: "Sofie Bakker",
    },
  ],

  review_request: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    {
      code: "google_review_url",
      label: "Google review-URL",
      example: "https://g.page/r/xxxxx/review",
    },
  ],

  parent_invoice_ready: [
    { code: "student_name", label: "Naam kind", example: "Jan de Vries" },
    { code: "invoice_no", label: "Factuurnummer", example: "1042" },
    { code: "amount", label: "Bedrag", example: "€ 350,00" },
    { code: "due_date", label: "Vervaldatum", example: "30 juni 2026" },
  ],

  parent_invoice_paid: [
    { code: "student_name", label: "Naam kind", example: "Jan de Vries" },
    { code: "invoice_no", label: "Factuurnummer", example: "1042" },
    { code: "amount", label: "Bedrag", example: "€ 350,00" },
    { code: "paid_at", label: "Betaaldatum", example: "di 3 jun 2026 14:22" },
  ],

  parent_lesson_scheduled: [
    { code: "student_name", label: "Naam kind", example: "Jan de Vries" },
    {
      code: "lesson_time",
      label: "Tijdstip les",
      example: "wo 10 jun 2026 14:00",
    },
    { code: "location", label: "Locatie", example: "Stationsplein 1, Utrecht" },
    {
      code: "instructor_name",
      label: "Instructeursnaam",
      example: "Sofie Bakker",
    },
  ],

  lesson_rescheduled: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    {
      code: "previous_lesson_time",
      label: "Oud tijdstip",
      example: "wo 10 jun 2026 14:00",
    },
    {
      code: "new_lesson_time",
      label: "Nieuw tijdstip",
      example: "vr 12 jun 2026 10:00",
    },
    { code: "location", label: "Locatie", example: "Stationsplein 1, Utrecht" },
    {
      code: "instructor_name",
      label: "Instructeursnaam",
      example: "Sofie Bakker",
    },
  ],

  lesson_rescheduled_instructor: [
    {
      code: "instructor_name",
      label: "Naam instructeur",
      example: "Sofie Bakker",
    },
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
    {
      code: "previous_lesson_time",
      label: "Oud tijdstip",
      example: "wo 10 jun 2026 14:00",
    },
    {
      code: "new_lesson_time",
      label: "Nieuw tijdstip",
      example: "vr 12 jun 2026 10:00",
    },
    { code: "location", label: "Locatie", example: "Stationsplein 1, Utrecht" },
  ],

  student_welcome: [
    { code: "student_name", label: "Naam leerling", example: "Jan de Vries" },
  ],
};

/**
 * Geeft alle shortcodes voor een trigger-key, inclusief de altijd-beschikbare
 * common shortcodes (tenant_name).
 */
export function getShortcodesForKey(eventKey: string): ShortcodeDef[] {
  const specific = CATALOG[eventKey as NotificationType] ?? [];
  return [...COMMON_SHORTCODES, ...specific];
}

/** Het volledige shortcode-catalogusobject voor server-side gebruik. */
export const SHORTCODE_CATALOG = CATALOG;
