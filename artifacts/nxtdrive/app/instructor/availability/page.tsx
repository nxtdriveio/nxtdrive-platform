import { InstructorAvailabilityManager } from "@/components/instructor/AvailabilityManager";

export const dynamic = "force-dynamic";

export default async function InstructorAvailabilityAliasPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return <InstructorAvailabilityManager redirectTo="/instructor/availability" error={sp.error} />;
}
