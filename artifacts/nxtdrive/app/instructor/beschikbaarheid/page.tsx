import { InstructorAvailabilityManager } from "@/components/instructor/AvailabilityManager";

export const dynamic = "force-dynamic";

export default async function InstructorAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return <InstructorAvailabilityManager redirectTo="/instructor/beschikbaarheid" error={sp.error} />;
}
