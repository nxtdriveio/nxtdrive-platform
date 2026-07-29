import { InstructorAvailabilityManager } from "@/components/instructor/AvailabilityManager";

export const dynamic = "force-dynamic";

export default async function InstructorAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const search = await searchParams;
  return (
    <InstructorAvailabilityManager
      redirectTo="/instructeur/beschikbaarheid"
      error={search.error}
    />
  );
}
