import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { getActiveStudent } from "@/lib/students/access";
import { Card, CardContent } from "@/components/ui/card";
import { ChatThread } from "@/components/chat/ChatThread";
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
      <Card>
        <CardContent className="space-y-2 pt-6">
          <h1 className="text-xl font-semibold text-foreground">Berichten</h1>
          <p className="text-sm text-muted-foreground">
            Je account is nog niet gekoppeld aan een leerlingdossier.
          </p>
        </CardContent>
      </Card>
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
        <h1 className="text-2xl font-semibold text-foreground">Berichten</h1>
        <Card>
          <CardContent className="space-y-2 pt-6 text-center">
            <MessageCircle
              className="mx-auto h-8 w-8 text-muted-foreground"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground">
              Je hebt nog geen instructeur waarmee je kunt chatten. Zodra je een
              les hebt gehad, verschijnt je instructeur hier.
            </p>
          </CardContent>
        </Card>
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
        <h1 className="text-2xl font-semibold text-foreground">Berichten</h1>
        <p className="text-sm text-muted-foreground">
          Kies een instructeur om mee te chatten.
        </p>
        <div className="space-y-2">
          {instructors.map((i) => (
            <Link
              key={i.instructorId}
              href={`/student/berichten?instructor=${i.instructorId}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
            >
              <MessageCircle className="h-5 w-5 text-primary" aria-hidden />
              {i.name}
            </Link>
          ))}
        </div>
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Berichten</h1>
        {instructors.length > 1 ? (
          <Link
            href="/student/berichten?pick=1"
            className="text-sm text-primary hover:underline"
          >
            Wissel instructeur
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
