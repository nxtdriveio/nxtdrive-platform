"use server";

import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LESSON_STATUS_LABEL } from "@/lib/lessons/types";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads/types";

export type SearchResultItem = {
  id: string;
  type: "student" | "lead" | "lesson";
  title: string;
  subtitle: string;
  href: string;
};

export type SearchResults = {
  students: SearchResultItem[];
  leads: SearchResultItem[];
  lessons: SearchResultItem[];
};

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export async function globalSearch(query: string): Promise<SearchResults> {
  const q = query.trim().replace(/[,()]/g, " ").trim();
  if (q.length < 2) return { students: [], leads: [], lessons: [] };

  const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);
  const supabase = await createServerSupabaseClient();
  const like = `%${q}%`;

  const [studentsRes, leadsRes] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, email, phone")
      .eq("tenant_id", tenant.id)
      .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .limit(5),
    supabase
      .from("leads")
      .select("id, full_name, email, phone, status")
      .eq("tenant_id", tenant.id)
      .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .limit(5),
  ]);

  const students: SearchResultItem[] = (studentsRes.data ?? []).map((s) => ({
    id: s.id,
    type: "student",
    title: s.full_name,
    subtitle: s.email ?? s.phone ?? "Geen contact",
    href: `/backoffice/leerlingen/${s.id}`,
  }));

  const leads: SearchResultItem[] = (leadsRes.data ?? []).map((l) => ({
    id: l.id,
    type: "lead",
    title: l.full_name,
    subtitle: `${LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status} · ${l.email ?? l.phone ?? "Geen contact"}`,
    href: `/backoffice/leads/${l.id}`,
  }));

  // Show recent lessons for students matching the query
  const matchingStudentIds = (studentsRes.data ?? []).map((s) => s.id);
  let lessons: SearchResultItem[] = [];

  if (matchingStudentIds.length > 0) {
    const { data: lessonData } = await supabase
      .from("lessons")
      .select("id, student_id, starts_at, status")
      .eq("tenant_id", tenant.id)
      .in("student_id", matchingStudentIds)
      .order("starts_at", { ascending: false })
      .limit(5);

    if (lessonData) {
      const studentMap = new Map(
        (studentsRes.data ?? []).map((s) => [s.id, s.full_name]),
      );
      lessons = lessonData.map((l) => ({
        id: l.id,
        type: "lesson",
        title: studentMap.get(l.student_id) ?? "Leerling",
        subtitle: `${dateFmt.format(new Date(l.starts_at))} · ${LESSON_STATUS_LABEL[l.status as keyof typeof LESSON_STATUS_LABEL] ?? l.status}`,
        href: `/backoffice/agenda/${l.id}`,
      }));
    }
  }

  return { students, leads, lessons };
}
