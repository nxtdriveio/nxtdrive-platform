import type { ExamPolicyDocument, ExamPreparationPolicy } from "./policy";

// ---------------------------------------------------------------------------
// Examenflow A — gedeelde types voor het examenvoorbereidingsdetail.
//
// Mirror van de DB-tabel `exam_appointment_details` (migratie 0069). Taak B/C
// lezen dit detail tenant-scoped via RLS (loader in lib/exam/data.ts) en tonen
// de afvinkbare documentenlijst, ophaaltijd en aandachtspunten.
// ---------------------------------------------------------------------------

/** Een document in de afvinkbare lijst, met de status per document. */
export type ExamRequiredDocument = {
  code: string;
  label: string;
  checked: boolean;
};

export type ExamAppointmentDetails = {
  appointmentId: string;
  tenantId: string;
  pickupAt: string | null;
  pickupLocation: string | null;
  requiredDocuments: ExamRequiredDocument[];
  examDayNotes: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

/**
 * Bouw een verse afvinkbare documentenlijst uit het tenant-beleid: alle
 * standaarddocumenten, nog niets afgevinkt. Gebruikt om een examen zonder
 * opgeslagen detail te initialiseren.
 */
export function initRequiredDocuments(
  policy: ExamPreparationPolicy,
): ExamRequiredDocument[] {
  return policy.required_documents.map((d: ExamPolicyDocument) => ({
    code: d.code,
    label: d.label,
    checked: false,
  }));
}

/**
 * Voeg het opgeslagen detail samen met het actuele tenant-beleid, zodat nieuw
 * toegevoegde standaarddocumenten ook verschijnen op een al bestaand detail
 * (de afvinkstatus van bekende codes blijft behouden). Documenten die niet meer
 * in het beleid staan maar wél zijn afgevinkt, blijven zichtbaar zodat eerder
 * vastgelegde info niet stilletjes verdwijnt.
 */
export function mergeRequiredDocuments(
  policy: ExamPreparationPolicy,
  stored: ExamRequiredDocument[],
): ExamRequiredDocument[] {
  const storedByCode = new Map(stored.map((d) => [d.code, d]));
  const result: ExamRequiredDocument[] = policy.required_documents.map((d) => ({
    code: d.code,
    label: d.label,
    checked: storedByCode.get(d.code)?.checked ?? false,
  }));
  const policyCodes = new Set(policy.required_documents.map((d) => d.code));
  for (const doc of stored) {
    if (!policyCodes.has(doc.code) && doc.checked) {
      result.push({ ...doc });
    }
  }
  return result;
}
