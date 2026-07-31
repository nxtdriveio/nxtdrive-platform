import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadinessResult } from "@workspace/leskaart";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";
import {
  buildChecklist,
  type CbrChecklistItem,
  type CbrCompetency,
  type StudentCbrProgressRow,
  type StudentCbrStatus,
} from "@/lib/cbr/types";
import type { LessonStatus } from "@/lib/lessons/types";
import type { AgendaAppointment } from "@/lib/agenda/types";
import { remainingCents, type Invoice } from "@/lib/invoices/types";
import type { Package } from "@/lib/packages/types";
import type { CreditLedgerRow, StudentBalance } from "@/lib/students/types";
import type { DocumentCategory } from "@/lib/students/document-types";
import { loadStudentDocumentMetadata } from "@/lib/students/documents";
import type { ParentPortalVisibility } from "./visibility";

// ---------------------------------------------------------------------------
// Task #96 — read-only data loader for the Ouderportaal.
//
// Every read goes through the RLS-scoped server client, so a parent only ever
// receives their linked child's rows (students / lessons / credit_ledger have a
// guardian RLS branch; invoices got one in migration 0058). On top of RLS we
// defensively select EXPLICIT columns and deliberately omit every internal
// field — most importantly `lessons.notes` (the legacy staff note) and the
// lesson cockpit context — so internal data can never leak even if a future RLS
// change widened parent access. Sections switched off by the tenant are neither
// queried nor returned.
// ---------------------------------------------------------------------------

/** A lesson as shown to a parent — no internal note, no cockpit context. */
export type PortalLesson = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: LessonStatus;
  location: string | null;
  credits_cost: number;
  progress_score: number | null;
};

const PORTAL_LESSON_COLUMNS =
  "id, starts_at, ends_at, status, location, credits_cost, progress_score";

const UPCOMING_LESSON_STATUSES: LessonStatus[] = ["planned", "in_progress"];

const STUDENT_LINKED_APPOINTMENT_TYPES = [
  "exam",
  "interim_test",
  "theory_guidance",
] as const;

/** One package as granted to the student — derived from the credit ledger. */
export type PortalPackage = {
  ledgerId: string;
  grantedAt: string;
  minutes: number;
  name: string | null;
  priceCents: number | null;
};

/**
 * A document as shown to a parent. Metadata only — the storage path is never
 * exposed; downloads go through the guarded /ouder/documenten/[docId] route.
 */
export type PortalDocument = {
  id: string;
  fileName: string;
  category: DocumentCategory;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type ParentPortalData = {
  planning: {
    upcomingLessons: PortalLesson[];
    pastLessons: PortalLesson[];
    appointments: AgendaAppointment[];
    pastAppointments: AgendaAppointment[];
  } | null;
  voortgang: {
    readiness: ReadinessResult;
    lessonHistory: PortalLesson[];
  } | null;
  examens: {
    cbrStatus: StudentCbrStatus | null;
    cbrChecklist: CbrChecklistItem[];
    examAppointments: AgendaAppointment[];
  } | null;
  facturen: {
    invoices: Invoice[];
    outstandingCents: number;
  } | null;
  betalingen: {
    invoices: Invoice[];
    paidInvoices: Invoice[];
    paidTotalCents: number;
    outstandingCents: number;
  } | null;
  pakketinformatie: {
    packages: PortalPackage[];
  } | null;
  tegoed: {
    balance: number;
    ledger: CreditLedgerRow[];
  } | null;
  // Linked parents read their child's document metadata via the 0059 guardian
  // RLS branch. Files themselves stay private — downloads go through the guarded
  // /ouder/documenten/[docId] route (short-lived signed URLs only).
  documenten: {
    documents: PortalDocument[];
  } | null;
};

/**
 * Loads exactly the sections the tenant has enabled for one student. Reads
 * only. Fails loud on any query error rather than silently degrading.
 */
export async function loadParentPortalData(
  rls: SupabaseClient,
  tenantId: string,
  studentId: string,
  visibility: ParentPortalVisibility,
): Promise<ParentPortalData> {
  const ctx = `tenant=${tenantId} student=${studentId}`;
  const nowIso = new Date().toISOString();

  const data: ParentPortalData = {
    planning: null,
    voortgang: null,
    examens: null,
    facturen: null,
    betalingen: null,
    pakketinformatie: null,
    tegoed: null,
    documenten: null,
  };

  if (visibility.planning) {
    const [upcomingRes, pastLessonsRes, appointmentsRes, pastAppointmentsRes] =
      await Promise.all([
        rls
          .from("lessons")
          .select(PORTAL_LESSON_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("student_id", studentId)
          .in("status", UPCOMING_LESSON_STATUSES)
          .gte("starts_at", nowIso)
          .order("starts_at", { ascending: true }),
        // Past lessons of any status (completed, cancelled, no-show) — read-only
        // history. Still no internal note column (PORTAL_LESSON_COLUMNS).
        rls
          .from("lessons")
          .select(PORTAL_LESSON_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("student_id", studentId)
          .lt("starts_at", nowIso)
          .order("starts_at", { ascending: false })
          .limit(50),
        rls
          .from("agenda_appointments")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("student_id", studentId)
          .eq("status", "planned")
          .gte("starts_at", nowIso)
          .in("type", STUDENT_LINKED_APPOINTMENT_TYPES as unknown as string[])
          .order("starts_at", { ascending: true }),
        rls
          .from("agenda_appointments")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("student_id", studentId)
          .lt("starts_at", nowIso)
          .in("type", STUDENT_LINKED_APPOINTMENT_TYPES as unknown as string[])
          .order("starts_at", { ascending: false })
          .limit(50),
      ]);
    if (upcomingRes.error) {
      throw new Error(
        `portal: upcoming lessons failed (${ctx}): ${upcomingRes.error.message}`,
      );
    }
    if (pastLessonsRes.error) {
      throw new Error(
        `portal: past lessons failed (${ctx}): ${pastLessonsRes.error.message}`,
      );
    }
    if (appointmentsRes.error) {
      throw new Error(
        `portal: appointments failed (${ctx}): ${appointmentsRes.error.message}`,
      );
    }
    if (pastAppointmentsRes.error) {
      throw new Error(
        `portal: past appointments failed (${ctx}): ${pastAppointmentsRes.error.message}`,
      );
    }
    data.planning = {
      upcomingLessons: (upcomingRes.data ?? []) as PortalLesson[],
      pastLessons: (pastLessonsRes.data ?? []) as PortalLesson[],
      appointments: (appointmentsRes.data ?? []) as AgendaAppointment[],
      pastAppointments: (pastAppointmentsRes.data ?? []) as AgendaAppointment[],
    };
  }

  if (visibility.voortgang) {
    const [readiness, historyRes] = await Promise.all([
      loadStudentReadiness(rls, tenantId, studentId),
      rls
        .from("lessons")
        .select(PORTAL_LESSON_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("student_id", studentId)
        .order("starts_at", { ascending: false })
        .limit(50),
    ]);
    if (historyRes.error) {
      throw new Error(
        `portal: lesson history failed (${ctx}): ${historyRes.error.message}`,
      );
    }
    data.voortgang = {
      readiness,
      lessonHistory: (historyRes.data ?? []) as PortalLesson[],
    };
  }

  if (visibility.examens) {
    const [cbrStatusRes, competenciesRes, progressRes, examRes] =
      await Promise.all([
        rls
          .from("student_cbr_status")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("student_id", studentId)
          .maybeSingle(),
        rls
          .from("cbr_competencies")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("sort_order", { ascending: true }),
        rls
          .from("student_cbr_progress")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("student_id", studentId),
        rls
          .from("agenda_appointments")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("student_id", studentId)
          .eq("status", "planned")
          .gte("starts_at", nowIso)
          .in("type", ["exam", "interim_test"])
          .order("starts_at", { ascending: true }),
      ]);
    if (cbrStatusRes.error) {
      throw new Error(
        `portal: cbr status failed (${ctx}): ${cbrStatusRes.error.message}`,
      );
    }
    if (competenciesRes.error) {
      throw new Error(
        `portal: cbr competencies failed (${ctx}): ${competenciesRes.error.message}`,
      );
    }
    if (progressRes.error) {
      throw new Error(
        `portal: cbr progress failed (${ctx}): ${progressRes.error.message}`,
      );
    }
    if (examRes.error) {
      throw new Error(
        `portal: exam appointments failed (${ctx}): ${examRes.error.message}`,
      );
    }
    data.examens = {
      cbrStatus: (cbrStatusRes.data as StudentCbrStatus | null) ?? null,
      cbrChecklist: buildChecklist(
        (competenciesRes.data ?? []) as CbrCompetency[],
        (progressRes.data ?? []) as StudentCbrProgressRow[],
      ),
      examAppointments: (examRes.data ?? []) as AgendaAppointment[],
    };
  }

  if (visibility.facturen) {
    // RLS (0058 guardian branch) already hides drafts from parents; we filter
    // again here so the portal never depends on policy ordering.
    const invoicesRes = await rls
      .from("invoices")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .neq("status", "draft")
      .order("created_at", { ascending: false });
    if (invoicesRes.error) {
      throw new Error(
        `portal: invoices failed (${ctx}): ${invoicesRes.error.message}`,
      );
    }
    const invoices = (invoicesRes.data ?? []) as Invoice[];
    data.facturen = {
      invoices,
      outstandingCents: invoices
        .filter((i) => i.status === "open")
        .reduce((sum, i) => sum + remainingCents(i), 0),
    };
  }

  if (visibility.betalingen) {
    // Parent-visible payment status is derived from non-draft invoices that the
    // guardian RLS branch exposes. payment_records stays staff-only.
    const invoicesRes = await rls
      .from("invoices")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .neq("status", "draft")
      .order("created_at", { ascending: false });
    if (invoicesRes.error) {
      throw new Error(
        `portal: payments failed (${ctx}): ${invoicesRes.error.message}`,
      );
    }
    const invoices = (invoicesRes.data ?? []) as Invoice[];
    const paidInvoices = invoices.filter(
      (invoice) => invoice.status === "paid",
    );
    data.betalingen = {
      invoices,
      paidInvoices,
      paidTotalCents: paidInvoices.reduce((sum, i) => sum + i.total_cents, 0),
      outstandingCents: invoices
        .filter((invoice) => invoice.status === "open")
        .reduce((sum, invoice) => sum + remainingCents(invoice), 0),
    };
  }

  if (visibility.pakketinformatie) {
    // Packages granted to the child = credit_ledger rows with the package_purchase
    // reason (both tables have a guardian/student RLS branch). We join the package
    // template for name/price; an unknown/removed package degrades gracefully.
    const ledgerRes = await rls
      .from("credit_ledger")
      .select("id, delta, related_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .eq("reason", "package_purchase")
      .order("created_at", { ascending: false });
    if (ledgerRes.error) {
      throw new Error(
        `portal: packages failed (${ctx}): ${ledgerRes.error.message}`,
      );
    }
    const ledgerRows = (ledgerRes.data ?? []) as {
      id: string;
      delta: number;
      related_id: string | null;
      created_at: string;
    }[];
    const packageIds = Array.from(
      new Set(
        ledgerRows.map((r) => r.related_id).filter((id): id is string => !!id),
      ),
    );
    let packagesById = new Map<string, Package>();
    if (packageIds.length > 0) {
      const pkgRes = await rls
        .from("packages")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("id", packageIds);
      if (pkgRes.error) {
        throw new Error(
          `portal: package templates failed (${ctx}): ${pkgRes.error.message}`,
        );
      }
      packagesById = new Map(
        ((pkgRes.data ?? []) as Package[]).map((p) => [p.id, p]),
      );
    }
    data.pakketinformatie = {
      packages: ledgerRows.map((row) => {
        const pkg = row.related_id
          ? packagesById.get(row.related_id)
          : undefined;
        return {
          ledgerId: row.id,
          grantedAt: row.created_at,
          minutes: row.delta,
          name: pkg?.name ?? null,
          priceCents: pkg?.price_cents ?? null,
        };
      }),
    };
  }

  if (visibility.tegoed) {
    const [balanceRes, ledgerRes] = await Promise.all([
      rls
        .from("student_credit_balance")
        .select("student_id, balance")
        .eq("student_id", studentId)
        .maybeSingle(),
      rls
        .from("credit_ledger")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (balanceRes.error) {
      throw new Error(
        `portal: balance failed (${ctx}): ${balanceRes.error.message}`,
      );
    }
    if (ledgerRes.error) {
      throw new Error(
        `portal: ledger failed (${ctx}): ${ledgerRes.error.message}`,
      );
    }
    data.tegoed = {
      balance: ((balanceRes.data as StudentBalance | null)?.balance ??
        0) as number,
      ledger: (ledgerRes.data ?? []) as CreditLedgerRow[],
    };
  }

  if (visibility.documenten) {
    // Linked parents read their child's document metadata via the 0059 guardian
    // RLS branch. We select metadata only — never the storage_path — so the
    // private file location never reaches the client; downloads are signed
    // server-side by the guarded /ouder/documenten/[docId] route.
    data.documenten = {
      documents: await loadStudentDocumentMetadata(rls, tenantId, studentId),
    };
  }

  return data;
}
