import { InstructorNewAppointmentManager } from "@/components/instructor/AppointmentManagers";

export const dynamic = "force-dynamic";

export default function InstructorAgendaNewPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    type?: string;
    student_id?: string;
    instructor_id?: string;
    branch_id?: string;
    vehicle_id?: string;
    pickup_service_area_id?: string;
    date?: string;
    time?: string;
    duration_min?: string;
    title?: string;
    location?: string;
    notes?: string;
  }>;
}) {
  return (
    <InstructorNewAppointmentManager
      searchParams={searchParams}
      formPath="/instructor/agenda/new"
      redirectTo="/instructor/agenda"
    />
  );
}
