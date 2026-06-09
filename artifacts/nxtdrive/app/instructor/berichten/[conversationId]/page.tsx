import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { ChatThread } from "@/components/chat/ChatThread";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import { loadInstructorThread } from "@/lib/chat/service";

export const dynamic = "force-dynamic";

export default async function InstructorThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const isAdmin = roles.includes("tenant_admin");
  const { conversationId } = await params;

  const thread = await loadInstructorThread({
    tenantId: tenant.id,
    conversationId,
    instructorId: user.id,
    isAdmin,
  });
  if (!thread) notFound();

  return (
    <PWAPage contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Communicatie"
        title={thread.counterpartName}
        description="Het volledige gesprek staat hieronder in een rustige, leesbare thread."
        align="left"
        actions={
          <Link
            href="/instructor/berichten"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Terug naar berichten
          </Link>
        }
      />
      <ChatThread
        conversationId={thread.conversationId}
        side={thread.side}
        counterpartName={thread.counterpartName}
        initialMessages={thread.messages}
      />
    </PWAPage>
  );
}
