import { getStudentPwaContext } from "@/lib/student-pwa/context";
import { findMessageThreadById } from "@/lib/student-pwa/service";
import {
  StudentChatThreadList,
  StudentChatWindow,
  StudentPageHeader,
} from "@/components/student/StudentPwa";

export const dynamic = "force-dynamic";

export default async function StudentMessageThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const { experience } = await getStudentPwaContext();
  const active = findMessageThreadById(experience, threadId);

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow="Berichten"
        title={active?.name ?? "Gesprek"}
        subtitle="Lees en beantwoord je gesprek."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(18rem,0.38fr)_minmax(0,0.62fr)]">
        <div className="hidden lg:block">
          <StudentChatThreadList threads={experience.messages} activeId={active?.id} />
        </div>
        <StudentChatWindow thread={active} showBack />
      </div>
    </div>
  );
}
