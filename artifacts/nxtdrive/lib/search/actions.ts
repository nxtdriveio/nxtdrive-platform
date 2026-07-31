"use server";

import { requireActiveTenant } from "@/lib/auth/require-role";
import { LESSON_STATUS_LABEL } from "@/lib/lessons/types";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads/types";
import { loadInstructorAccessibleStudentIds } from "@/lib/students/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

  const { tenant, user, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const isAdmin = roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;
  const supabase = await createServerSupabaseClient();
  const like = `%${q}%`;

  const accessibleStudentIds = isAdmin
    ? null
    : await loadInstructorAccessibleStudentIds(supabase, tenant.id, user.id);

  if (!isAdmin && (!accessibleStudentIds || accessibleStudentIds.length === 0)) {
    return { students: [], leads: [], lessons: [] };
  }

  let studentQuery = supabase
    .from("students")
    .select("id, full_name, email, phone")
    .eq("tenant_id", tenant.id)
    .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
    .limit(5);

  if (!isAdmin && accessibleStudentIds) {
    studentQuery = studentQuery.in("id", accessibleStudentIds);
  }

  const [studentsRes, leadsRes] = await Promise.all([
    studentQuery,
    isAdmin
      ? supabase
          .from("leads")
          .select("id, full_name, email, phone, status")
          .eq("tenant_id", tenant.id)
          .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const studentRows = studentsRes.data ?? [];
  const students: SearchResultItem[] = studentRows.map((student) => ({
    id: student.id,
    type: "student",
    title: student.full_name,
    subtitle: student.email ?? student.phone ?? "Geen contact",
    href: `/instructeur/leerlingen/${student.id}`,
  }));

  const leads: SearchResultItem[] = (leadsRes.data ?? []).map((lead) => ({
    id: lead.id,
    type: "lead",
    title: lead.full_name,
    subtitle: `${LEAD_STATUS_LABEL[lead.status as LeadStatus] ?? lead.status} · ${lead.email ?? lead.phone ?? "Geen contact"}`,
    href: `/backoffice/leads/${lead.id}`,
  }));

  const matchingStudentIds = studentRows.map((student) => student.id);
  let lessons: SearchResultItem[] = [];

  if (matchingStudentIds.length > 0) {
    let lessonQuery = supabase
      .from("lessons")
      .select("id, student_id, starts_at, status, instructor_id")
      .eq("tenant_id", tenant.id)
      .in("student_id", matchingStudentIds)
      .order("starts_at", { ascending: false })
      .limit(5);

    if (!isAdmin) {
      lessonQuery = lessonQuery.eq("instructor_id", user.id);
    }

    const { data: lessonRows } = await lessonQuery;

    if (lessonRows) {
      const studentMap = new Map(studentRows.map((student) => [student.id, student.full_name]));
      lessons = lessonRows.map((lesson) => ({
        id: lesson.id,
        type: "lesson",
        title: studentMap.get(lesson.student_id) ?? "Leerling",
        subtitle: `${dateFmt.format(new Date(lesson.starts_at))} · ${LESSON_STATUS_LABEL[lesson.status as keyof typeof LESSON_STATUS_LABEL] ?? lesson.status}`,
        href: `/instructeur/lessen/${lesson.id}`,
      }));
    }
  }

  return { students, leads, lessons };
}
