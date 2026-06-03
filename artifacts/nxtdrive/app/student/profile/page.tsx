import Link from "next/link";
import { LogOut, Mail, Phone, MapPin, User } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getActiveStudent } from "@/lib/students/access";
import { RefillOptInForm } from "@/components/student/refill-optin-form";
import { ReviewForm } from "@/components/student/review-form";
import { PushToggle } from "@/components/notifications/PushToggle";
import { getVapidPublicKey } from "@/lib/notifications/web-push";
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
  const vapidPublicKey = getVapidPublicKey();

  // Eigen review (RLS: een leerling/voogd ziet uitsluitend de eigen review).
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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Mijn profiel</h1>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-foreground">
                  {student?.full_name ?? user.profile?.full_name ?? user.email}
                </h2>
                {student ? (
                  <Badge variant={student.active ? "success" : "default"}>
                    {student.active ? "Actief" : "Inactief"}
                  </Badge>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">
                {tenant.name}
              </div>
            </div>
          </div>

          <dl className="space-y-2 text-sm">
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

          <p className="text-xs text-muted-foreground">
            Klopt er iets niet? Neem contact op met je rijschool — zij kunnen je
            gegevens bijwerken.
          </p>
        </CardContent>
      </Card>

      <PushToggle vapidPublicKey={vapidPublicKey} />

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
        <Card>
          <CardContent className="space-y-2 pt-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Wissel van leerling
            </div>
            <Link
              href="/student/select-child"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Andere leerling kiezen ({otherChildren.length})
            </Link>
          </CardContent>
        </Card>
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
