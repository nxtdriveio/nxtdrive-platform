import "server-only";

import { createStudentDemoData } from "./student-demo-data";
import type { StudentExperience } from "./types";

export async function getStudentExperience({
  studentName,
  tenantName,
  email,
  phone,
}: {
  studentName: string;
  tenantName: string;
  email?: string | null;
  phone?: string | null;
}): Promise<StudentExperience> {
  return createStudentDemoData({ studentName, tenantName, email, phone });
}

export function findLessonById(
  data: StudentExperience,
  lessonId: string,
) {
  const lessons = [data.nextLesson, ...data.previousLessons];
  return lessons.find((lesson) => lesson.id === lessonId) ?? data.nextLesson;
}

export function findMessageThreadById(
  data: StudentExperience,
  threadId: string | undefined,
) {
  if (!threadId) return data.messages[0] ?? null;
  return data.messages.find((thread) => thread.id === threadId) ?? data.messages[0] ?? null;
}
