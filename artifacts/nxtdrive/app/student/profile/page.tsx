import Link from "next/link";
import { LogOut, Mail, Phone, MapPin, User, Bell } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { PWAPageHeader, PWACard, PWASectionHeader } from "@/components/pwa/primitives";
import { getActiveStudent } from "@/lib/students/access";
import { RefillOptInForm } from "@/components/student/refill-optin-form";
import { ReviewForm } from "@/components/student/review-form";
import { PushToggle } from "@/components/notifications/PushToggle";
import { NotificationTypeToggles } from "@/components/notifications/NotificationTypeToggles";
import { getVapidPublicKey } from "@/lib/notifications/web-push";
import { getNotificationPreference, getNotificationTypePreferences } from "@/lib/notifications/push-actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StudentProfilePage() {
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const { student, accessible } = await getActiveStudent(
    user,
    tenant.id,
    roles,
  );
  const [vapidPublicKey, serverPushEnabled, typePreferences] = await Promise.all([
    Promise.resolve(getVapidPublicKey()),
    getNotificationPreference(),
    getNotificationTypePreferences(),
  ]);

  let existingReview: { rating: number; body: string | null } | null = null;
  if (student) {
    const supabase = await createServerSupabaseClient();
    const { data: reviewRow } = await supabase
      .from("student_reviews")
      .select("rating, body")
      .eq("tenant_id", tenant.id)
      .eq("student_id", student.id)
      .maybeSingle();
    existingReview = (reviewRow as { rating: number; body: string | null } | null) ?? null;
  }
  const isParent = roles.includes("parent") && !roles.includes("student");
  const otherChildren = isParent
    ? accessible.filter((s) => s.id !== student?.id && s.user_id !== user.id)
    : [];

  const displayName = student?.full_name ?? user.profile?.full_name ?? user.email ?? "Leerling";

  return (
    <div className="space-y-4">
      <PWAPageHeader
        title="Mijn profiel"
        icon={<User className="h-4 w-4" aria-hidden />}
      />

      <PWACard>
        <div className="flex items-start gap-4">
          <Avatar name={displayName} className="h-14 w-14 text-base shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-foreground">
                {displayName}
              </h2>
              {student ? (
                <Badge variant={student.active ? "success" : "default"}>
                  {student.active ? "Actief" : "Inactief"}
                </Badge>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">{tenant.name}</div>
          </div>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <dt className="sr-only">E-mail</dt>
            <dd className="truncate text-foreground">
              {student?.email ?? user.email}
            </dd>
          </div>
          {student?.phone ? (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Telefoon</dt>
              <dd className="text-foreground">{student.phone}</dd>
            </div>
          ) : null}
          {student?.postcode ? (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Postcode</dt>
              <dd className="text-foreground">{student.postcode}</dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-4 text-xs text-muted-foreground">
          Klopt er iets niet? Neem contact op met je rijschool — zij kunnen je
          gegevens bijwerken.
        </p>
      </PWACard>

      {/* Notification preferences */}
      <div className="space-y-3">
        <PWASectionHeader icon={<Bell className="h-3.5 w-3.5" aria-hidden />}>
          Meldingen
        </PWASectionHeader>
        <PushToggle vapidPublicKey={vapidPublicKey} serverPushEnabled={serverPushEnabled} />
        <PWACard>
          <p className="text-xs text-muted-foreground mb-4">
            Kies welke meldingen je wilt ontvangen. Uitgeschakelde types worden
            ook niet in de app getoond.
          </p>
          <NotificationTypeToggles initialPreferences={typePreferences} />
        </PWACard>
      </div>

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

      {isParent && otherChildren.length > 0 ? (
        <PWACard>
          <PWASectionHeader>Wissel van leerling</PWASectionHeader>
          <Link
            href="/student/select-child"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Andere leerling kiezen ({otherChildren.length})
          </Link>
        </PWACard>
      ) : null}

      <form action="/auth/logout" method="post">
        <button
          type="submit"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Uitloggen
        </button>
      </form>

      <div className="text-center text-xs text-muted-foreground">
        <Link href="/" className="hover:underline">
          Terug naar start
        </Link>
      </div>
    </div>
  );
}
