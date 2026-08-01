import Link from "next/link";
import {
  CalendarClock,
  Home,
  MapPin,
  MessageCircle,
  Navigation,
  UserRound,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { getActiveStudent } from "@/lib/students/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import {
  StudentInitialBadge,
  StudentListRow,
  StudentShowcaseCard,
  StudentShowcaseEmptyState,
} from "@/components/student/Showcase";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function valueOrMissing(value: string | null | undefined): string {
  return value?.trim() || "Nog niet ingevuld";
}

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-[1.05rem] border border-brand-border/70 bg-white px-3.5 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-brand-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-brand-foreground">
        {valueOrMissing(value)}
      </dd>
    </div>
  );
}

export default async function StudentAccountPage() {
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const { student } = await getActiveStudent(user, tenant.id, roles);
  const supabase = await createServerSupabaseClient();
  const nextLessonResult = student
    ? await supabase
        .from("lessons")
        .select("id, starts_at, location")
        .eq("tenant_id", tenant.id)
        .eq("student_id", student.id)
        .in("status", ["planned", "in_progress"])
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };
  if (nextLessonResult.error) {
    throw new Error(
      `Tijdelijke ophaallocatie laden mislukt: ${nextLessonResult.error.message}`,
    );
  }

  if (!student) {
    return (
      <PWAPage app="student" contentClassName="space-y-4">
        <PWAPageHeader
          eyebrow="Meer"
          title="Account"
          subtitle="Persoons-, adres- en ophaalgegevens uit je leerlingdossier."
          icon={<UserRound className="h-4 w-4" aria-hidden />}
        />
        <StudentShowcaseCard title="Account" eyebrow="Leerlingdossier">
          <StudentShowcaseEmptyState
            title="Nog geen leerling gekoppeld"
            description="Je accountgegevens verschijnen zodra je leerlingdossier is gekoppeld."
          />
        </StudentShowcaseCard>
      </PWAPage>
    );
  }

  const displayName =
    student.full_name ?? user.profile?.full_name ?? user.email ?? "Leerling";
  const homeAddress = [student.address_line, student.postcode, student.city]
    .filter(Boolean)
    .join(", ");
  const fixedPickup = student.pickup_address?.trim() || homeAddress || null;
  const nextLesson = nextLessonResult.data as {
    id: string;
    starts_at: string;
    location: string | null;
  } | null;
  const lessonLocation = nextLesson?.location?.trim() || null;
  const temporaryPickup =
    lessonLocation &&
    lessonLocation.toLocaleLowerCase("nl-NL") !==
      fixedPickup?.toLocaleLowerCase("nl-NL")
      ? lessonLocation
      : null;

  return (
    <PWAPage app="student" contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Meer"
        title="Account"
        subtitle="Persoons-, adres- en ophaalgegevens uit je leerlingdossier."
        icon={<UserRound className="h-4 w-4" aria-hidden />}
      />

      <StudentShowcaseCard
        title="Persoonsgegevens"
        eyebrow="Jouw dossier"
        info="Deze gegevens worden gebruikt voor je rijopleiding en lesplanning."
      >
        <div className="mb-4 flex items-start gap-4">
          <Avatar name={displayName} className="h-14 w-14 shrink-0 text-base" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-black text-brand-foreground">
                {displayName}
              </h2>
              <Badge variant={student.active ? "success" : "outline"}>
                {student.active ? "Actief" : "Inactief"}
              </Badge>
            </div>
            <p className="text-xs text-brand-muted-foreground">{tenant.name}</p>
          </div>
        </div>
        <dl className="grid gap-2 sm:grid-cols-2">
          <ProfileField label="Volledige naam" value={student.full_name} />
          <ProfileField
            label="Geboortedatum"
            value={
              student.birth_date
                ? dateFormatter.format(
                    new Date(`${student.birth_date}T12:00:00.000Z`),
                  )
                : null
            }
          />
          <ProfileField
            label="E-mailadres"
            value={student.email ?? user.email}
          />
          <ProfileField label="Telefoonnummer" value={student.phone} />
        </dl>
      </StudentShowcaseCard>

      <StudentShowcaseCard
        title="Adresgegevens"
        eyebrow="Woonadres"
        info="Je vaste adres staat los van de ophaallocatie die voor rijlessen wordt gebruikt."
      >
        <dl className="grid gap-2 sm:grid-cols-2">
          <ProfileField
            label="Straat en huisnummer"
            value={student.address_line}
          />
          <ProfileField label="Postcode" value={student.postcode} />
          <ProfileField label="Woonplaats" value={student.city} />
        </dl>
      </StudentShowcaseCard>

      <StudentShowcaseCard
        title="Ophaallocaties"
        eyebrow="Rijlessen"
        info="Een tijdelijke locatie geldt alleen voor de vermelde eerstvolgende les en verandert je vaste ophaallocatie niet."
      >
        <div className="space-y-2">
          <StudentListRow
            title="Vaste ophaallocatie"
            subtitle={valueOrMissing(fixedPickup)}
            badge="Standaard"
            badgeVariant="primary"
            leading={<StudentInitialBadge label="Vast" tone="blue" />}
          />
          {temporaryPickup && nextLesson ? (
            <StudentListRow
              href={`/leerling/lessen/${nextLesson.id}`}
              title="Tijdelijke ophaallocatie"
              subtitle={`${temporaryPickup} · ${dateFormatter.format(
                new Date(nextLesson.starts_at),
              )}`}
              badge="Deze les"
              badgeVariant="warning"
              leading={<StudentInitialBadge label="Tijd" tone="orange" />}
            />
          ) : (
            <div className="flex items-start gap-3 rounded-[1.05rem] border border-dashed border-brand-border bg-brand-muted/30 px-3.5 py-3">
              <Navigation
                className="mt-0.5 h-5 w-5 shrink-0 text-brand-muted-foreground"
                aria-hidden
              />
              <div>
                <p className="text-sm font-semibold text-brand-foreground">
                  Geen tijdelijke ophaallocatie
                </p>
                <p className="mt-0.5 text-xs leading-5 text-brand-muted-foreground">
                  Je eerstvolgende les gebruikt de vaste ophaallocatie, of er
                  staat nog geen afwijkende locatie gepland.
                </p>
              </div>
            </div>
          )}
        </div>
      </StudentShowcaseCard>

      <StudentShowcaseCard
        title="Gegevens aanpassen"
        eyebrow="Via je rijschool"
        info="Wijzigingen worden door je rijschool gecontroleerd zodat lesplanning en dossiergegevens gelijk blijven."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-[1.05rem] bg-brand-muted/35 p-3 text-sm text-brand-muted-foreground">
            <Home className="h-4 w-4 shrink-0" aria-hidden />
            Adres of vaste ophaallocatie wijzigen
          </div>
          <div className="flex items-center gap-3 rounded-[1.05rem] bg-brand-muted/35 p-3 text-sm text-brand-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            Tijdelijke locatie voor een les afspreken
          </div>
        </div>
        <Link
          href="/leerling/berichten"
          className={`${buttonVariants({ size: "sm" })} mt-3`}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Stuur je rijschool een bericht
        </Link>
        {temporaryPickup && nextLesson ? (
          <Link
            href={`/leerling/lessen/${nextLesson.id}`}
            className={`${buttonVariants({
              variant: "outline",
              size: "sm",
            })} mt-3 sm:ml-2`}
          >
            <CalendarClock className="h-4 w-4" aria-hidden />
            Open betreffende les
          </Link>
        ) : null}
      </StudentShowcaseCard>
    </PWAPage>
  );
}
