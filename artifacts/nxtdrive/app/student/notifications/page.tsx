import { getStudentPwaContext } from "@/lib/student-pwa/context";
import {
  StudentNotificationList,
  StudentPageHeader,
} from "@/components/student/StudentPwa";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function StudentNotificationsPage() {
  const { experience } = await getStudentPwaContext();

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow="Meldingen"
        title="Updates"
        subtitle="Lessen, feedback, betalingen en berichten die aandacht vragen."
        action={
          <button type="button" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Alles gelezen
          </button>
        }
      />
      <StudentNotificationList notifications={experience.notifications} />
    </div>
  );
}
