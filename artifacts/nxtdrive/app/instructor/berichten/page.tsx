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
  const latestConversation = conversations[0] ?? null;
  const unreadCount = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);

  return (
    <PWAPage app="instructor" contentClassName="space-y-5">
      <PWAPageHeader
        eyebrow="Communicatie"
        title="Berichten"
        description="Gesprekken met je leerlingen, direct vanuit je instructeurapp."
        align="left"
      />

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

      {conversations.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-[15rem] flex-col items-center justify-center space-y-2 pt-6 text-center">
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
        <div className="grid gap-5 xl:grid-cols-[minmax(19rem,0.88fr)_minmax(0,1.12fr)]">
          <div className="space-y-2">
            {conversations.map((c) => (
              <Link
                key={c.id}
                href={`/instructor/berichten/${c.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
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

          <PWACard
            title="Preview"
            className="bg-card"
            contentClassName="flex h-full flex-col justify-between gap-5"
            headerRight={<Sparkles className="h-4 w-4 text-primary" aria-hidden />}
          >
            {latestConversation ? (
              <>
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
                </div>

                <Link
                  href={`/instructor/berichten/${latestConversation.id}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-primary/80"
                >
                  Open gesprek
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </>
            ) : (
              <div className="flex min-h-[14rem] items-center justify-center text-sm text-muted-foreground">
                Geen preview beschikbaar.
              </div>
            )}
          </PWACard>
        </div>
      )}
    </PWAPage>
  );
}
