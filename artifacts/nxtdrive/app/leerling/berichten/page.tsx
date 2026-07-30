import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { getActiveStudent } from "@/lib/students/access";
import { ChatThread } from "@/components/chat/ChatThread";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
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
  StudentShowcaseEmptyState,
} from "@/components/student/Showcase";

export const dynamic = "force-dynamic";

export default async function StudentBerichtenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, tenant, roles } = await requireActiveTenant(["student", "parent"]);
  const { student, needsChildPicker } = await getActiveStudent(user, tenant.id, roles);
  if (needsChildPicker) redirect("/leerling/kies-leerling");

  if (!student) {
    return (
      <PWAPage app="student">
        <PWAPageHeader
          title="Berichten"
          subtitle="Chat met je instructeur en rijschool."
          icon={<MessageCircle className="h-4 w-4" aria-hidden />}
        />
        <StudentShowcaseCard title="Berichten" eyebrow="Studentdossier">
          <StudentShowcaseEmptyState
            title="Nog geen leerling gekoppeld"
            description="Zodra je dossier gekoppeld is, kun je hier veilig chatten met je instructeur en rijschool."
          />
        </StudentShowcaseCard>
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
        <StudentShowcaseCard title="Nog geen chat" eyebrow="Rijschoolcontact">
          <StudentShowcaseEmptyState
            icon={<MessageCircle className="h-5 w-5" aria-hidden />}
            title="Nog geen instructeur gekoppeld"
            description="Zodra je een les hebt gehad of een instructeur aan jouw dossier hangt, verschijnt je chat hier automatisch."
          />
        </StudentShowcaseCard>
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
                href={`/leerling/berichten?instructor=${instructor.instructorId}`}
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
              href="/leerling/berichten"
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
