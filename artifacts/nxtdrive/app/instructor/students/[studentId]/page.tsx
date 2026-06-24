import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function InstructorStudentAliasPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  redirect(`/instructor/leerlingen/${studentId}`);
}
