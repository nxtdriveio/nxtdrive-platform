import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, LogOut, Settings2, Users } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { getActiveStudent } from "@/lib/students/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getVapidPublicKey } from "@/lib/notifications/web-push";
import {
  getNotificationPreference,
  getNotificationTypePreferences,
} from "@/lib/notifications/push-actions";
import { PushToggle } from "@/components/notifications/PushToggle";
import { NotificationTypeToggles } from "@/components/notifications/NotificationTypeToggles";
import { RefillOptInForm } from "@/components/student/refill-optin-form";
import { ReviewForm } from "@/components/student/review-form";
import { StudentShowcaseCard } from "@/components/student/Showcase";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function StudentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (query.tab === "documenten") redirect("/leerling/documenten");
  if (query.tab === "contact") redirect("/leerling/hulp");
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const { student, accessible } = await getActiveStudent(
    user,
    tenant.id,
    roles,
  );
  const supabase = await createServerSupabaseClient();
  const [vapidPublicKey, serverPushEnabled, typePreferences, reviewResult] =
    await Promise.all([
      Promise.resolve(getVapidPublicKey()),
      getNotificationPreference(),
      getNotificationTypePreferences(),
      student
        ? supabase
            .from("student_reviews")
            .select("rating, body")
            .eq("tenant_id", tenant.id)
            .eq("student_id", student.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
  if (reviewResult.error) {
    throw new Error(`Review laden mislukt: ${reviewResult.error.message}`);
  }
  const existingReview = reviewResult.data as {
    rating: number;
    body: string | null;
  } | null;
  const isParent = roles.includes("parent") && !roles.includes("student");
  const otherChildren = isParent
    ? accessible.filter((candidate) => candidate.id !== student?.id)
    : [];

  return (
    <PWAPage app="student" contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Meer"
        title="Instellingen"
        subtitle="Beheer meldingen, lesvoorkeuren en je app-sessie."
        icon={<Settings2 className="h-4 w-4" aria-hidden />}
      />

      <StudentShowcaseCard
        title="Pushmeldingen"
        eyebrow="Meldingen"
        info="Zet pushmeldingen aan op dit apparaat en bepaal per categorie wat je wilt ontvangen."
        bodyClassName="space-y-4"
      >
        <PushToggle
          vapidPublicKey={vapidPublicKey}
          serverPushEnabled={serverPushEnabled}
        />
        <div className="rounded-[1.15rem] border border-brand-border/70 bg-brand-muted/35 px-3.5 py-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-foreground">
            <Bell className="h-4 w-4 text-brand-primary" aria-hidden />
            Type meldingen
          </div>
          <NotificationTypeToggles initialPreferences={typePreferences} />
        </div>
      </StudentShowcaseCard>

      {student ? (
        <RefillOptInForm
          studentId={student.id}
          optIn={student.refill_opt_in}
          preferredDayparts={student.refill_preferred_dayparts ?? []}
        />
      ) : null}

      {student ? (
        <ReviewForm
          studentId={student.id}
          initialRating={existingReview?.rating ?? null}
          initialBody={existingReview?.body ?? null}
        />
      ) : null}

      {otherChildren.length > 0 ? (
        <StudentShowcaseCard title="Wissel van leerling" eyebrow="Ouderaccount">
          <Link
            href="/leerling/kies-leerling"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Users className="h-4 w-4" aria-hidden />
            Andere leerling kiezen ({otherChildren.length})
          </Link>
        </StudentShowcaseCard>
      ) : null}

      <StudentShowcaseCard title="Sessie" eyebrow="Beveiliging">
        <form action="/auth/logout" method="post">
          <button
            type="submit"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Uitloggen
          </button>
        </form>
      </StudentShowcaseCard>
    </PWAPage>
  );
}
