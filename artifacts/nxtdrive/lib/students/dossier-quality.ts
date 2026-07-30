import type { ReadinessResult } from "@workspace/leskaart";

import type { StudentCbrStatus } from "@/lib/cbr/types";
import type { Invoice } from "@/lib/invoices/types";
import type { Lesson } from "@/lib/lessons/types";
import {
  DOCUMENT_CATEGORY_LABEL,
  type DocumentCategory,
  type StudentDocument,
} from "@/lib/students/document-types";
import type { StudentLinkedTask } from "@/lib/students/dossier";
import type { Student } from "@/lib/students/types";
import type { TheoryHomeworkWithModule } from "@/lib/theory/types";

export type StudentNawSummary = {
  dateOfBirth: string | null;
  city: string | null;
  postalCode: string | null;
  address: string | null;
  pickupLocation: string | null;
};

export type DossierQualityTone = "danger" | "warning" | "info" | "success";

export type StudentDossierQualitySignal = {
  id: string;
  tone: DossierQualityTone;
  title: string;
  description: string;
  href?: string;
  cta?: string;
};

export type StudentDossierQualitySummary = {
  score: number;
  label: string;
  tone: DossierQualityTone;
  signals: StudentDossierQualitySignal[];
};

const REQUIRED_DOCUMENTS: DocumentCategory[] = [
  "id_copy",
  "authorization",
  "terms",
];

export function buildStudentDossierQualitySummary(input: {
  student: Student;
  naw: StudentNawSummary;
  nextLesson: Lesson | null;
  balanceMinutes: number;
  invoices: Invoice[];
  cbrStatus: StudentCbrStatus | null;
  theory: TheoryHomeworkWithModule[];
  readiness: ReadinessResult;
  tasks: StudentLinkedTask[];
  documents: StudentDocument[];
  now?: Date;
}): StudentDossierQualitySummary {
  const signals = buildStudentDossierSignals(input);
  const danger = signals.filter((signal) => signal.tone === "danger").length;
  const warning = signals.filter((signal) => signal.tone === "warning").length;
  const info = signals.filter((signal) => signal.tone === "info").length;
  const penalty = danger * 24 + warning * 12 + info * 5;
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return {
    score,
    label:
      danger > 0
        ? "Actie nodig"
        : warning > 0
          ? "Aandacht"
          : info > 0
            ? "Opvolgen"
            : "Compleet",
    tone:
      danger > 0
        ? "danger"
        : warning > 0
          ? "warning"
          : info > 0
            ? "info"
            : "success",
    signals,
  };
}

export function buildStudentDossierSignals(input: {
  student: Student;
  naw: StudentNawSummary;
  nextLesson: Lesson | null;
  balanceMinutes: number;
  invoices: Invoice[];
  cbrStatus: StudentCbrStatus | null;
  theory: TheoryHomeworkWithModule[];
  readiness: ReadinessResult;
  tasks: StudentLinkedTask[];
  documents: StudentDocument[];
  now?: Date;
}): StudentDossierQualitySignal[] {
  const now = input.now ?? new Date();
  const signals: StudentDossierQualitySignal[] = [];
  const missingProfile = missingProfileFields(input.student, input.naw);
  if (missingProfile.length > 0) {
    signals.push({
      id: "missing-profile",
      tone: "warning",
      title: "Leerlinggegevens aanvullen",
      description: `Ontbreekt: ${missingProfile.join(", ")}. Dit remt planning, CBR-opvolging en communicatie.`,
      href: `/backoffice/leerlingen/${input.student.id}`,
      cta: "Profiel bijwerken",
    });
  }

  const missingDocuments = missingDocumentCategories(input.documents);
  if (missingDocuments.length > 0) {
    signals.push({
      id: "missing-documents",
      tone: "warning",
      title: "Documenten ontbreken",
      description: `Nog nodig: ${missingDocuments.map((category) => DOCUMENT_CATEGORY_LABEL[category]).join(", ")}.`,
      href: `/backoffice/leerlingen/${input.student.id}`,
      cta: "Documenten controleren",
    });
  }

  const staleDocuments = input.documents.filter((document) =>
    isOlderThanDays(document.created_at, now, 365),
  );
  if (staleDocuments.length > 0) {
    signals.push({
      id: "stale-documents",
      tone: "info",
      title: "Documenten herbeoordelen",
      description: `${staleDocuments.length} document(en) zijn ouder dan een jaar. Controleer of ze nog geldig zijn.`,
    });
  }

  const openInvoices = input.invoices.filter(
    (invoice) => invoice.status === "open",
  );
  if (openInvoices.length > 0) {
    signals.push({
      id: "open-invoices",
      tone: "warning",
      title: "Open facturen",
      description: `${openInvoices.length} factuur/facturen staan nog open.`,
    });
  }

  if (input.balanceMinutes <= 0) {
    signals.push({
      id: "no-credit",
      tone: "danger",
      title: "Geen lestegoed",
      description:
        "De leerling kan niet betrouwbaar worden ingepland zonder tegoed.",
    });
  } else if (input.balanceMinutes <= 120) {
    signals.push({
      id: "low-credit",
      tone: "warning",
      title: "Bijna door tegoed heen",
      description: "Er is nog maximaal twee uur lestegoed beschikbaar.",
    });
  }

  if (!input.nextLesson) {
    signals.push({
      id: "no-next-lesson",
      tone: "info",
      title: "Geen volgende les",
      description: "Plan de volgende les zodat de voortgang niet stilvalt.",
      href: `/backoffice/agenda/nieuw?student_id=${input.student.id}`,
      cta: "Les plannen",
    });
  }

  signals.push(...buildCbrSignals(input.cbrStatus));

  const openTheory = input.theory.filter((item) => item.status === "open");
  if (openTheory.length > 0) {
    signals.push({
      id: "open-theory",
      tone: "info",
      title: "Theorie-opdrachten open",
      description: `${openTheory.length} theorie-opdracht(en) wachten nog op afronding.`,
    });
  }

  if (input.readiness.advice !== "examenwaardig") {
    signals.push({
      id: "exam-readiness",
      tone: input.readiness.readinessPct >= 80 ? "info" : "warning",
      title: "Examengereedheid opvolgen",
      description:
        input.readiness.blockers[0] ??
        "RIS-score, stabiliteit of CBR-voorwaarden zijn nog niet volledig klaar.",
    });
  }

  if (input.tasks.length > 0) {
    signals.push({
      id: "open-tasks",
      tone: "info",
      title: "Open taken",
      description: `Eerstvolgend: ${input.tasks[0]!.title}.`,
    });
  }

  return signals;
}

export function nextBestActionFromSignals(
  signals: StudentDossierQualitySignal[],
): StudentDossierQualitySignal | null {
  return (
    signals.find((signal) => signal.tone === "danger") ??
    signals.find((signal) => signal.tone === "warning") ??
    signals.find((signal) => signal.tone === "info") ??
    null
  );
}

function missingProfileFields(
  student: Student,
  naw: StudentNawSummary,
): string[] {
  return [
    !student.email ? "e-mailadres" : null,
    !student.phone ? "telefoon" : null,
    !naw.postalCode ? "postcode" : null,
    !naw.address ? "adres" : null,
    !naw.city ? "woonplaats" : null,
    !naw.dateOfBirth ? "geboortedatum" : null,
    !naw.pickupLocation ? "ophaaladres" : null,
  ].filter((field): field is string => Boolean(field));
}

function missingDocumentCategories(
  documents: StudentDocument[],
): DocumentCategory[] {
  const present = new Set(documents.map((document) => document.category));
  return REQUIRED_DOCUMENTS.filter((category) => !present.has(category));
}

function buildCbrSignals(
  cbrStatus: StudentCbrStatus | null,
): StudentDossierQualitySignal[] {
  if (!cbrStatus) {
    return [
      {
        id: "cbr-missing",
        tone: "warning",
        title: "CBR-status ontbreekt",
        description:
          "Leg theorie, machtiging en gezondheidsverklaring vast voordat examenplanning start.",
      },
    ];
  }
  const missing: string[] = [];
  if (!cbrStatus.theorie_behaald) missing.push("theorie");
  if (!cbrStatus.machtiging_geregeld) missing.push("machtiging");
  if (
    cbrStatus.gezondheidsverklaring_vereist !== false &&
    !cbrStatus.gezondheidsverklaring_geregeld
  ) {
    missing.push("gezondheidsverklaring");
  }
  if (missing.length === 0) return [];
  return [
    {
      id: "cbr-actions",
      tone: "warning",
      title: "CBR-acties open",
      description: `Nog regelen of bevestigen: ${missing.join(", ")}.`,
    },
  ];
}

function isOlderThanDays(value: string, now: Date, days: number): boolean {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  return now.getTime() - date.getTime() > days * 86400000;
}
