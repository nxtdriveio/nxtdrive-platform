import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Task #113 — referralflow data laag. Alle mutaties lopen via de service-role
 * RPCs uit migratie 0076 (SECURITY DEFINER, anon/authenticated revoked, geaudit).
 * Lezen gebeurt tenant-bounded via de service-role client vanuit server actions.
 */

export type ReferredLead = {
  leadId: string;
  fullName: string | null;
  email: string | null;
  status: string;
  createdAt: string;
  rewardHandledAt: string | null;
};

export type ReferrerGroup = {
  studentId: string;
  studentName: string | null;
  code: string | null;
  referredLeads: ReferredLead[];
  /** Leads die het traject zijn gestart of geconverteerd zijn. */
  convertedCount: number;
  /** Geconverteerde referrals waarvan de beloning nog niet is afgehandeld. */
  pendingRewardCount: number;
};

type LeadRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  created_at: string;
  referred_by_student_id: string | null;
  referral_reward_handled_at: string | null;
};

/** Statussen die meetellen als "geconverteerd" voor beloningsdoeleinden. */
const CONVERTED_STATUSES = new Set([
  "trial_completed",
  "converted",
]);

/**
 * Zorg dat een leerling een referralcode heeft (idempotent) en geef die terug.
 * Best-effort: bij een fout wordt null teruggegeven zodat de UI netjes degradeert.
 */
export async function ensureStudentReferralCode(
  service: SupabaseClient,
  tenantId: string,
  studentId: string,
  actor: string,
): Promise<string | null> {
  const { data, error } = await service.rpc("ensure_student_referral_code", {
    p_student_id: studentId,
    p_tenant_id: tenantId,
    p_actor: actor,
  });
  if (error) {
    console.error("[referrals] ensure_student_referral_code failed", error);
    return null;
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

/**
 * Bouw de publieke referral-URL: de intakepagina van de rijschool met de code
 * als `?ref=`. De code wordt geattribueerd zodra de lead wordt aangemaakt.
 */
export function buildReferralUrl(
  origin: string,
  slug: string,
  code: string,
): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/intake/${slug}?ref=${encodeURIComponent(code)}`;
}

export type StudentReferralStatus = {
  /** Of de aanmelding het traject is gestart/geconverteerd is. */
  converted: boolean;
  /** Of de beloning voor deze aanmelding handmatig is afgehandeld. */
  rewardHandled: boolean;
} & Pick<ReferredLead, "leadId" | "fullName" | "status" | "createdAt">;

export type StudentReferralSummary = {
  total: number;
  convertedCount: number;
  rewardedCount: number;
  referrals: StudentReferralStatus[];
};

/** Maskeer een naam voor de verwijzende leerling: alleen voornaam + initiaal. */
function maskReferredName(name: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0] as string;
  if (parts.length === 1) return first;
  const lastInitial = (parts[parts.length - 1] as string).charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

/**
 * Leerling-overzicht: de status van de eigen aandragingen ("status van zijn
 * aandragingen"). Strikt tenant-scoped én gefilterd op de actieve leerling als
 * verwijzer. Namen van aangedragen leads worden gemaskeerd (voornaam + initiaal)
 * — een verwijzer hoeft niet de volledige NAW van een ander te zien. Best-effort:
 * bij een fout een lege samenvatting zodat de PWA netjes degradeert.
 */
export async function loadStudentReferralSummary(
  service: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<StudentReferralSummary> {
  const empty: StudentReferralSummary = {
    total: 0,
    convertedCount: 0,
    rewardedCount: 0,
    referrals: [],
  };
  const { data: leadsRaw, error } = await service
    .from("leads")
    .select("id, full_name, status, created_at, referral_reward_handled_at")
    .eq("tenant_id", tenantId)
    .eq("referred_by_student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[referrals] loadStudentReferralSummary failed", error);
    return empty;
  }
  const leads =
    (leadsRaw as Pick<
      LeadRow,
      "id" | "full_name" | "status" | "created_at" | "referral_reward_handled_at"
    >[] | null) ?? [];

  const referrals: StudentReferralStatus[] = leads.map((lead) => {
    const converted = CONVERTED_STATUSES.has(lead.status);
    return {
      leadId: lead.id,
      fullName: maskReferredName(lead.full_name),
      status: lead.status,
      createdAt: lead.created_at,
      converted,
      rewardHandled: lead.referral_reward_handled_at !== null,
    };
  });

  return {
    total: referrals.length,
    convertedCount: referrals.filter((r) => r.converted).length,
    rewardedCount: referrals.filter((r) => r.rewardHandled).length,
    referrals,
  };
}

/**
 * Backoffice-overzicht: alle leads die via een referral binnenkwamen,
 * gegroepeerd per doorverwijzende leerling, met afhandelingsstatus van de
 * beloning. Tenant-bounded; bedoeld voor een admin-gescoopte server action.
 */
export async function loadReferralOverview(
  service: SupabaseClient,
  tenantId: string,
): Promise<ReferrerGroup[]> {
  const { data: leadsRaw, error } = await service
    .from("leads")
    .select(
      "id, full_name, email, status, created_at, referred_by_student_id, referral_reward_handled_at",
    )
    .eq("tenant_id", tenantId)
    .not("referred_by_student_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[referrals] loadReferralOverview leads failed", error);
    return [];
  }
  const leads = (leadsRaw as LeadRow[] | null) ?? [];

  const referrerIds = Array.from(
    new Set(
      leads
        .map((l) => l.referred_by_student_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );

  const [studentsRes, codesRes] = await Promise.all([
    referrerIds.length
      ? service
          .from("students")
          .select("id, full_name")
          .eq("tenant_id", tenantId)
          .in("id", referrerIds)
      : Promise.resolve({ data: [], error: null }),
    referrerIds.length
      ? service
          .from("referral_codes")
          .select("student_id, code")
          .eq("tenant_id", tenantId)
          .in("student_id", referrerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const nameById = new Map<string, string | null>();
  for (const s of (studentsRes.data as { id: string; full_name: string | null }[] | null) ??
    []) {
    nameById.set(s.id, s.full_name);
  }
  const codeById = new Map<string, string>();
  for (const c of (codesRes.data as { student_id: string; code: string }[] | null) ??
    []) {
    codeById.set(c.student_id, c.code);
  }

  const groups = new Map<string, ReferrerGroup>();
  for (const lead of leads) {
    const sid = lead.referred_by_student_id;
    if (!sid) continue;
    let group = groups.get(sid);
    if (!group) {
      group = {
        studentId: sid,
        studentName: nameById.get(sid) ?? null,
        code: codeById.get(sid) ?? null,
        referredLeads: [],
        convertedCount: 0,
        pendingRewardCount: 0,
      };
      groups.set(sid, group);
    }
    const converted = CONVERTED_STATUSES.has(lead.status);
    group.referredLeads.push({
      leadId: lead.id,
      fullName: lead.full_name,
      email: lead.email,
      status: lead.status,
      createdAt: lead.created_at,
      rewardHandledAt: lead.referral_reward_handled_at,
    });
    if (converted) {
      group.convertedCount += 1;
      if (!lead.referral_reward_handled_at) group.pendingRewardCount += 1;
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => b.referredLeads.length - a.referredLeads.length,
  );
}
