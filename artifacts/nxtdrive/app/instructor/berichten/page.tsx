import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { Card, CardContent } from "@/components/ui/card";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import { loadInstructorConversations } from "@/lib/chat/service";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function InstructorBerichtenPage() {
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const isAdmin = roles.includes("tenant_admin");

  const conversations = await loadInstructorConversations({
    tenantId: tenant.id,
    instructorId: user.id,
    isAdmin,
  });

  return (
    <PWAPage contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Communicatie"
        title="Berichten"
        description="Gesprekken met je leerlingen, direct vanuit je instructeurapp."
        align="left"
      />

      {conversations.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 pt-6 text-center">
            <MessageCircle
              className="mx-auto h-8 w-8 text-muted-foreground"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground">
              Nog geen gesprekken. Zodra een leerling je een bericht stuurt,
              verschijnt het hier.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/instructor/berichten/${c.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">
                    {c.studentName}
                  </span>
                  {c.unreadCount > 0 ? (
                    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      {c.unreadCount > 99 ? "99+" : c.unreadCount}
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {c.lastMessagePreview ?? "Nog geen berichten"}
                </p>
                {isAdmin ? (
                  <p className="truncate text-xs text-muted-foreground">
                    Instructeur: {c.instructorName}
                  </p>
                ) : null}
              </div>
              {c.lastMessageAt ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {dateFmt.format(new Date(c.lastMessageAt))}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </PWAPage>
  );
}
