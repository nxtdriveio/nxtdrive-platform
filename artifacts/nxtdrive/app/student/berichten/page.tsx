import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { getActiveStudent } from "@/lib/students/access";
import { ChatThread } from "@/components/chat/ChatThread";
import { PWAEmptyState, PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import {
  ensureConversation,
  listStudentInstructors,
  loadThreadMessages,
  markConversationRead,
} from "@/lib/chat/service";
import {
  StudentInitialBadge,
  StudentListRow,
  StudentShowcaseCard,
} from "@/components/student/Showcase";

export const dynamic = "force-dynamic";

export default async function StudentBerichtenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, tenant, roles } = await requireActiveTenant(["student", "parent"]);
  const { student, needsChildPicker } = await getActiveStudent(user, tenant.id, roles);
  if (needsChildPicker) redirect("/student/select-child");

  if (!student) {
    return (
      <PWAPage app="student">
        <PWAPageHeader
          title="Berichten"
          subtitle="Chat met je instructeur en rijschool."
          icon={<MessageCircle className="h-4 w-4" aria-hidden />}
        />
        <PWAEmptyState message="Je account is nog niet gekoppeld aan een leerlingdossier." />
      </PWAPage>
    );
  }

  const instructors = await listStudentInstructors({
    tenantId: tenant.id,
    studentId: student.id,
  });
  const params = await searchParams;
  const requested = typeof params.instructor === "string" ? params.instructor : undefined;

  if (instructors.length === 0) {
    return (
      <PWAPage app="student">
        <PWAPageHeader
          title="Berichten"
          subtitle="Je chat verschijnt zodra er een instructeur aan jou gekoppeld is."
          icon={<MessageCircle className="h-4 w-4" aria-hidden />}
        />
        <PWAEmptyState
          icon={<MessageCircle className="h-8 w-8" aria-hidden />}
          title="Nog geen chat"
          message="Je hebt nog geen instructeur waarmee je kunt chatten. Zodra je een les hebt gehad, verschijnt je instructeur hier."
        />
      </PWAPage>
    );
  }

  const active =
    instructors.find((instructor) => instructor.instructorId === requested) ??
    (instructors.length === 1 ? instructors[0] : undefined);

  if (!active) {
    return (
      <PWAPage app="student" contentClassName="space-y-4">
        <PWAPageHeader
          title="Berichten"
          subtitle="Kies met wie je wilt chatten."
          icon={<MessageCircle className="h-4 w-4" aria-hidden />}
        />
        <StudentShowcaseCard
          title="Beschikbare gesprekken"
          eyebrow="Rijschoolcontact"
          info="Hier zie je de instructeurs met wie je vanuit je studentdossier kunt chatten."
        >
          <div className="space-y-2">
            {instructors.map((instructor) => (
              <StudentListRow
                key={instructor.instructorId}
                href={`/student/berichten?instructor=${instructor.instructorId}`}
                title={instructor.name}
                subtitle="Open chat"
                badge="Chat"
                badgeVariant="primary"
                leading={<StudentInitialBadge label="Chat" />}
              />
            ))}
          </div>
        </StudentShowcaseCard>
      </PWAPage>
    );
  }

  const conversationId = await ensureConversation({
    tenantId: tenant.id,
    studentId: student.id,
    instructorId: active.instructorId,
    actorId: user.id,
  });
  await markConversationRead({
    tenantId: tenant.id,
    conversationId,
    actorId: user.id,
  });
  const messages = await loadThreadMessages(tenant.id, conversationId);

  return (
    <PWAPage app="student" contentClassName="space-y-4">
      <PWAPageHeader
        title="Berichten"
        subtitle={`Chat direct met ${active.name}.`}
        icon={<MessageCircle className="h-4 w-4" aria-hidden />}
        actions={
          instructors.length > 1 ? (
            <Link
              href="/student/berichten"
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-primary"
            >
              Wissel chat
            </Link>
          ) : null
        }
      />
      <ChatThread
        conversationId={conversationId}
        side="student"
        counterpartName={active.name}
        initialMessages={messages}
      />
    </PWAPage>
  );
}
