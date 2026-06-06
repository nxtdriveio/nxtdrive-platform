import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { getActiveStudent } from "@/lib/students/access";
import { ChatThread } from "@/components/chat/ChatThread";
import {
  PWACard,
  PWAEmptyState,
  PWAPageHeader,
} from "@/components/pwa/primitives";
import {
  ensureConversation,
  listStudentInstructors,
  loadThreadMessages,
  markConversationRead,
} from "@/lib/chat/service";

export const dynamic = "force-dynamic";

export default async function StudentBerichtenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const { student, needsChildPicker } = await getActiveStudent(
    user,
    tenant.id,
    roles,
  );
  if (needsChildPicker) redirect("/student/select-child");

  if (!student) {
    return (
      <div className="space-y-4">
        <PWAPageHeader
          title="Berichten"
          subtitle="Chat met je instructeur en rijschool."
          icon={<MessageCircle className="h-4 w-4" aria-hidden />}
        />
        <PWAEmptyState message="Je account is nog niet gekoppeld aan een leerlingdossier." />
      </div>
    );
  }

  const instructors = await listStudentInstructors({
    tenantId: tenant.id,
    studentId: student.id,
  });
  const sp = await searchParams;
  const requested =
    typeof sp.instructor === "string" ? sp.instructor : undefined;

  if (instructors.length === 0) {
    return (
      <div className="space-y-4">
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
      </div>
    );
  }

  // Pick the active instructor: the requested one (if valid), else the only one,
  // else show the picker.
  const active =
    instructors.find((i) => i.instructorId === requested) ??
    (instructors.length === 1 ? instructors[0] : undefined);

  if (!active) {
    return (
      <div className="space-y-4">
        <PWAPageHeader
          title="Berichten"
          subtitle="Kies met wie je wilt chatten."
          icon={<MessageCircle className="h-4 w-4" aria-hidden />}
        />
        <PWACard>
          <div className="space-y-2">
            {instructors.map((i) => (
              <Link
                key={i.instructorId}
                href={`/student/berichten?instructor=${i.instructorId}`}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 px-4 py-3 text-sm font-bold text-foreground shadow-sm backdrop-blur-xl transition hover:border-primary/50 hover:bg-primary-soft/50 active:scale-[0.99]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <MessageCircle className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 truncate">{i.name}</span>
              </Link>
            ))}
          </div>
        </PWACard>
      </div>
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
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <PWAPageHeader
          title="Berichten"
          subtitle={`Chat met ${active.name}.`}
          icon={<MessageCircle className="h-4 w-4" aria-hidden />}
          className="mb-0 min-w-0 flex-1"
        />
        {instructors.length > 1 ? (
          <Link
            href="/student/berichten?pick=1"
            className="shrink-0 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur-xl transition hover:bg-card"
          >
            Wissel
          </Link>
        ) : null}
      </div>
      <ChatThread
        conversationId={conversationId}
        side="student"
        counterpartName={active.name}
        initialMessages={messages}
      />
    </div>
  );
}
