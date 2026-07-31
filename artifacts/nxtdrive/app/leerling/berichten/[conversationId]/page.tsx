import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { ChatThread } from "@/components/chat/ChatThread";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import { buttonVariants } from "@/components/ui/button";
import { loadStudentThread } from "@/lib/chat/service";
import { getActiveStudent } from "@/lib/students/access";

export default async function LearnerMessagePage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const { student, needsChildPicker } = await getActiveStudent(
    user,
    tenant.id,
    roles,
  );
  if (needsChildPicker) redirect("/leerling/kies-leerling");
  if (!student) redirect("/leerling/berichten");

  const thread = await loadStudentThread({
    tenantId: tenant.id,
    conversationId,
    studentId: student.id,
    actorId: user.id,
  });
  if (!thread) redirect("/leerling/berichten");

  return (
    <PWAPage app="student" contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Berichten"
        title={thread.counterpartName}
        subtitle={`Chat direct met ${thread.counterpartName}.`}
        icon={<MessageCircle className="h-4 w-4" aria-hidden />}
        actions={
          <Link
            href="/leerling/berichten"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Gesprekken
          </Link>
        }
      />
      <ChatThread
        conversationId={thread.conversationId}
        side="student"
        counterpartName={thread.counterpartName}
        initialMessages={thread.messages}
      />
    </PWAPage>
  );
}
