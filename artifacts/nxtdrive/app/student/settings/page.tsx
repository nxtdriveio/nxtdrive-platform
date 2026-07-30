import Link from "next/link";
import { Bell, Lock, LogOut, Smartphone, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import {
  StudentPageHeader,
  StudentSection,
} from "@/components/student/StudentPwa";

export const dynamic = "force-dynamic";

export default async function StudentSettingsPage() {
  const { experience, accessible } = await getStudentPwaContext();
  const hasLinkedChildren = accessible.length > 1;

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow="Instellingen"
        title="Account en app"
        subtitle="Beheer je profiel, meldingen, privacy en PWA-voorkeuren."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(22rem,0.8fr)_minmax(0,1.2fr)]">
        <StudentSection title="Persoonlijke gegevens" icon={User}>
          <div className="rounded-[var(--radius-card)] border border-brand-border bg-card/90 p-4 shadow-brand-card">
            <div className="flex items-start gap-4">
              <Avatar
                name={experience.profile.name}
                className="h-14 w-14 text-base"
              />
              <div className="min-w-0">
                <h2 className="truncate text-lg font-black text-brand-foreground">
                  {experience.profile.name}
                </h2>
                <p className="text-sm text-brand-muted-foreground">
                  {experience.profile.tenantName} -{" "}
                  {experience.profile.roleLabel}
                </p>
                <p className="mt-2 text-sm text-brand-muted-foreground">
                  {experience.profile.email ?? "E-mail niet ingevuld"}
                </p>
              </div>
            </div>
            <Link
              href="/leerling/instellingen"
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "mt-4",
              })}
            >
              Profiel bekijken
            </Link>
          </div>
        </StudentSection>

        <div className="space-y-4">
          <StudentSection title="Meldingen" icon={Bell}>
            <SettingsRow
              title="Pushmeldingen"
              body="Ontvang updates over lessen, feedback, betalingen en berichten."
            />
          </StudentSection>

          <StudentSection title="Locaties" icon={User}>
            <SettingsRow
              title="Woonadres en ophaalpunten"
              body="Beheer je vaste en extra locaties en controleer wat bij een les wordt gebruikt."
              href="/leerling/instellingen/locaties"
            />
          </StudentSection>

          <StudentSection title="Privacy" icon={Lock}>
            <SettingsRow
              title="Je leerlinggegevens"
              body="Je ziet alleen je eigen informatie. Conceptnotities van instructeurs blijven afgeschermd."
            />
          </StudentSection>

          <StudentSection title="App installeren" icon={Smartphone}>
            <SettingsRow
              title="NXTDRIVE als app"
              body="Installeer de leerlingomgeving op je startscherm voor snelle toegang."
            />
          </StudentSection>

          {hasLinkedChildren ? (
            <StudentSection title="Gekoppelde leerlingen" icon={User}>
              <SettingsRow
                title="Wissel actieve leerling"
                body="Kies welk leerlingprofiel je wilt bekijken."
                href="/leerling/kies-leerling"
              />
            </StudentSection>
          ) : null}

          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className={buttonVariants({ variant: "outline" })}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Uitloggen
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function SettingsRow({
  title,
  body,
  href,
}: {
  title: string;
  body: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-[var(--radius-card)] border border-brand-border bg-card/90 p-4 shadow-brand-card">
      <p className="text-sm font-black text-brand-foreground">{title}</p>
      <p className="mt-1 text-sm leading-6 text-brand-muted-foreground">
        {body}
      </p>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
