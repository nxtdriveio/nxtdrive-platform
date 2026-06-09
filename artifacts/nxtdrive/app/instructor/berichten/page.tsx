import Link from "next/link";
import { ArrowRight, MessageCircle, Sparkles } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { Card, CardContent } from "@/components/ui/card";
import {
  PWACard,
  PWAKpiGrid,
  PWAKpiTile,
  PWAPage,
  PWAPageHeader,
} from "@/components/pwa/primitives";
import {
  loadInstructorConversations,
  loadInstructorThread,
} from "@/lib/chat/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadInstructorAccessibleStudentIds } from "@/lib/students/access";
import { ChatThread } from "@/components/chat/ChatThread";
import { openInstructorConversationAction } from "./actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function InstructorBerichtenPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string; error?: string }>;
}) {
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const sp = await searchParams;
  const isAdmin = roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;

  const [conversations, studentCandidates] = await Promise.all([
    loadInstructorConversations({
      tenantId: tenant.id,
      instructorId: user.id,
      isAdmin,
    }),
    (async () => {
      const supabase = await createServerSupabaseClient();
      const service = createServiceRoleClient();
      const accessibleStudentIds = isAdmin
        ? null
        : await loadInstructorAccessibleStudentIds(service, tenant.id, user.id);
      let studentsQuery = supabase
        .from("students")
        .select("id, full_name")
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .order("full_name", { ascending: true });
      if (accessibleStudentIds) {
        studentsQuery =
          accessibleStudentIds.length > 0
            ? studentsQuery.in("id", accessibleStudentIds)
            : studentsQuery.in("id", ["__none__"]);
      }
      const { data } = await studentsQuery;
      return (data ?? []) as Array<{ id: string; full_name: string }>;
    })(),
  ]);

  const latestConversation = conversations[0] ?? null;
  const activeConversationId = sp.conversation ?? latestConversation?.id ?? null;
  const activeThread = activeConversationId
    ? await loadInstructorThread({
        tenantId: tenant.id,
        conversationId: activeConversationId,
        instructorId: user.id,
        isAdmin,
      })
    : null;
  const activeSummary =
    conversations.find((conversation) => conversation.id === activeThread?.conversationId) ?? null;
  const unreadCount = conversations.reduce(
    (sum, conversation) => sum + conversation.unreadCount,
    0,
  );

  return (
    <PWAPage app="instructor" contentClassName="space-y-5">
      <PWAPageHeader
        eyebrow="Communicatie"
        title="Berichten"
        description="Gesprekken met je leerlingen, direct vanuit je instructeurapp. Kies een thread of start meteen een nieuw gesprek."
        align="left"
      />

      {sp.error ? (
        <Card className="border-danger/40 bg-danger/5">
          <CardContent className="pt-6 text-sm text-danger">
            Berichtflow kon niet worden geopend. Probeer het opnieuw vanuit de leerlingcontext.
          </CardContent>
        </Card>
      ) : null}

      <PWAKpiGrid compact className="lg:grid-cols-3">
        <PWAKpiTile
          label="Gesprekken"
          value={conversations.length}
          hint="Actieve leerlingconversaties in jouw inbox."
          info="Alle actieve chatthreads tussen jou en je leerlingen binnen deze rijschool."
        />
        <PWAKpiTile
          label="Ongelezen"
          value={unreadCount}
          hint="Berichten die nog directe aandacht vragen."
          info="Nieuwe leerlingberichten die jij nog niet hebt geopend of afgehandeld."
        />
        <PWAKpiTile
          label="Laatste update"
          value={latestConversation?.studentName ?? "Rustig"}
          hint={
            latestConversation?.lastMessageAt
              ? dateFmt.format(new Date(latestConversation.lastMessageAt))
              : "Nog geen recente leerlingactiviteit."
          }
          info="Laatste leerling of thread waarin nog recente activiteit zichtbaar was."
        />
      </PWAKpiGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(22rem,0.82fr)_minmax(0,1.18fr)]">
        <div className="space-y-4">
          <PWACard title="Nieuw gesprek" className="bg-card">
            <form action={openInstructorConversationAction} className="space-y-3">
              <label className="block text-sm font-medium text-foreground" htmlFor="student_id">
                Leerling kiezen
              </label>
              <select
                id="student_id"
                name="student_id"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                defaultValue={
                  activeSummary?.studentId ?? studentCandidates[0]?.id ?? ""
                }
                required
              >
                {studentCandidates.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.full_name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                Gesprek openen
              </button>
            </form>
          </PWACard>

          {conversations.length === 0 ? (
            <Card>
              <CardContent className="flex min-h-[15rem] flex-col items-center justify-center space-y-2 pt-6 text-center">
                <MessageCircle
                  className="mx-auto h-8 w-8 text-muted-foreground"
                  aria-hidden
                />
                <p className="text-sm text-muted-foreground">
                  Nog geen gesprekken. Start hierboven meteen een eerste bericht aan een leerling.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/instructor/berichten?conversation=${conversation.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {conversation.studentName}
                      </span>
                      {conversation.unreadCount > 0 ? (
                        <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {conversation.lastMessagePreview ?? "Nog geen berichten"}
                    </p>
                    {isAdmin ? (
                      <p className="truncate text-xs text-muted-foreground">
                        Instructeur: {conversation.instructorName}
                      </p>
                    ) : null}
                  </div>
                  {conversation.lastMessageAt ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {dateFmt.format(new Date(conversation.lastMessageAt))}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </div>

        <PWACard
          title={activeThread ? activeThread.counterpartName : "Inbox preview"}
          className="bg-card"
          contentClassName="space-y-4"
          headerRight={<Sparkles className="h-4 w-4 text-primary" aria-hidden />}
        >
          {activeThread ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-background px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Laatste contact
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {activeSummary?.lastMessageAt
                      ? dateFmt.format(new Date(activeSummary.lastMessageAt))
                      : "Nog geen timestamp"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Open aandacht
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {activeSummary && activeSummary.unreadCount > 0
                      ? `${activeSummary.unreadCount} ongelezen`
                      : "Inbox bijgewerkt"}
                  </p>
                </div>
              </div>

              <ChatThread
                conversationId={activeThread.conversationId}
                side={activeThread.side}
                counterpartName={activeThread.counterpartName}
                initialMessages={activeThread.messages}
              />
            </>
          ) : latestConversation ? (
            <div className="space-y-3">
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {latestConversation.studentName}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {latestConversation.lastMessagePreview ??
                    "Nog geen concreet bericht, maar de thread staat klaar."}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-background px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Laatste contact
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {latestConversation.lastMessageAt
                      ? dateFmt.format(new Date(latestConversation.lastMessageAt))
                      : "Nog geen timestamp"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Open aandacht
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {latestConversation.unreadCount > 0
                      ? `${latestConversation.unreadCount} ongelezen`
                      : "Inbox bijgewerkt"}
                  </p>
                </div>
              </div>

              <Link
                href={`/instructor/berichten?conversation=${latestConversation.id}`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-primary/80"
              >
                Open gesprek
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          ) : (
            <div className="flex min-h-[14rem] items-center justify-center text-sm text-muted-foreground">
              Geen preview beschikbaar.
            </div>
          )}
        </PWACard>
      </div>
    </PWAPage>
  );
}
