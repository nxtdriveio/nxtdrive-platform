import { MessageCircle } from "lucide-react";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import { findMessageThreadById } from "@/lib/student-pwa/service";
import {
  StudentChatThreadList,
  StudentChatWindow,
  StudentEmptyState,
  StudentPageHeader,
} from "@/components/student/StudentPwa";

export const dynamic = "force-dynamic";

export default async function StudentMessagesPage() {
  const { experience } = await getStudentPwaContext();
  const active = findMessageThreadById(experience, undefined);

  if (experience.messages.length === 0) {
    return (
      <StudentEmptyState
        icon={MessageCircle}
        title="Je hebt nog geen berichten."
        message="Zodra je rijschool of instructeur je een bericht stuurt, verschijnt het hier."
      />
    );
  }

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow="Berichten"
        title="Chat met je rijschool"
        subtitle="Vragen over lessen, planning of betalingen hou je overzichtelijk bij elkaar."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(18rem,0.38fr)_minmax(0,0.62fr)]">
        <StudentChatThreadList threads={experience.messages} activeId={active?.id} />
        <div className="hidden lg:block">
          <StudentChatWindow thread={active} />
        </div>
      </div>
    </div>
  );
}
