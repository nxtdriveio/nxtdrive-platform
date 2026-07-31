import Link from "next/link";
import {
  Bell,
  FileStack,
  LifeBuoy,
  LogOut,
  Mail,
  Phone,
  Settings2,
  User,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import { getActiveStudent } from "@/lib/students/access";
import { RefillOptInForm } from "@/components/student/refill-optin-form";
import { ReviewForm } from "@/components/student/review-form";
import { PushToggle } from "@/components/notifications/PushToggle";
import { NotificationTypeToggles } from "@/components/notifications/NotificationTypeToggles";
import { getVapidPublicKey } from "@/lib/notifications/web-push";
import {
  getNotificationPreference,
  getNotificationTypePreferences,
} from "@/lib/notifications/push-actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadContactPhone, telHref } from "@/lib/tenant/contact-phone";
import { loadOrganizationProfile } from "@/lib/organization/profile";
import { loadStudentCbrSummary } from "@/lib/cbr/data";
import {
  StudentInitialBadge,
  StudentListRow,
  StudentShowcaseCard,
  StudentShowcaseTabs,
} from "@/components/student/Showcase";
import { ContactCard } from "@/components/student/ContactCard";
import { loadStudentDocumentMetadata } from "@/lib/students/documents";
import {
  DOCUMENT_CATEGORY_LABEL,
  formatFileSize,
} from "@/lib/students/document-types";

export const dynamic = "force-dynamic";

type ProfileTab = "documenten" | "instellingen" | "contact";

function profileTabFrom(value: string | undefined): ProfileTab {
  if (value === "documenten" || value === "contact") return value;
  return "instellingen";
}

export default async function StudentProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const activeTab = profileTabFrom(
    typeof params.tab === "string" ? params.tab : undefined,
  );

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
  const [settingsBundle, contactBundle, documentsBundle] = await Promise.all([
    activeTab === "instellingen"
      ? Promise.all([
          Promise.resolve(getVapidPublicKey()),
          getNotificationPreference(),
          getNotificationTypePreferences(),
        ])
      : Promise.resolve(null),
    activeTab === "contact"
      ? Promise.all([
          loadOrganizationProfile(supabase, tenant.id),
          loadContactPhone(supabase, tenant.id),
        ])
      : Promise.resolve(null),
    activeTab === "documenten" && student
      ? Promise.all([
          loadStudentCbrSummary(supabase, tenant.id, student.id),
          supabase
            .from("invoices")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenant.id)
            .eq("student_id", student.id),
          loadStudentDocumentMetadata(supabase, tenant.id, student.id),
        ])
      : Promise.resolve(null),
  ]);
  const [vapidPublicKey, serverPushEnabled, typePreferences] =
    settingsBundle ?? [null, false, {}];
  const [orgProfile, contactPhone] = contactBundle ?? [null, null];
  const [cbrSummary, invoicesRes, documents] = documentsBundle ?? [
    null,
    { count: 0, error: null },
    [],
  ];
  if (invoicesRes.error) {
    throw new Error(`Facturen laden mislukt: ${invoicesRes.error.message}`);
  }

  let existingReview: { rating: number; body: string | null } | null = null;
  if (student && activeTab === "instellingen") {
    const { data: reviewRow, error } = await supabase
      .from("student_reviews")
      .select("rating, body")
      .eq("tenant_id", tenant.id)
      .eq("student_id", student.id)
      .maybeSingle();
    if (error) {
      throw new Error(`Review laden mislukt: ${error.message}`);
    }
    existingReview =
      (reviewRow as { rating: number; body: string | null } | null) ?? null;
  }

  const isParent = roles.includes("parent") && !roles.includes("student");
  const otherChildren = isParent
    ? accessible.filter(
        (accessibleStudent) =>
          accessibleStudent.id !== student?.id &&
          accessibleStudent.user_id !== user.id,
      )
    : [];
  const displayName =
    student?.full_name ?? user.profile?.full_name ?? user.email ?? "Leerling";
  const supportEmail =
    orgProfile?.support_email ?? orgProfile?.billing_email ?? null;
  const phoneHref = telHref(contactPhone);
  const invoiceCount = invoicesRes.count ?? 0;

  const tabs = [
    {
      key: "documenten",
      label: "Documenten",
      href: "/leerling/instellingen?tab=documenten",
    },
    {
      key: "instellingen",
      label: "Instellingen",
      href: "/leerling/instellingen?tab=instellingen",
    },
    {
      key: "contact",
      label: "Contact",
      href: "/leerling/instellingen?tab=contact",
    },
  ] satisfies Array<{ key: ProfileTab; label: string; href: string }>;

  return (
    <PWAPage app="student" contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Account"
        title="Account"
        subtitle="Je profiel, appvoorkeuren, documenten en contact met je rijschool."
        icon={<Settings2 className="h-4 w-4" aria-hidden />}
      />

      <StudentShowcaseTabs items={tabs} activeKey={activeTab} />

      {activeTab === "documenten" ? (
        <div className="space-y-4">
          <StudentShowcaseCard
            title="Mijn documenten"
            eyebrow="Veilige downloads"
            info="Bestanden uit je leerlingdossier worden via een tijdelijke, beveiligde downloadlink geopend."
          >
            <div className="space-y-2">
              {documents.length > 0 ? (
                documents.map((document) => (
                  <StudentListRow
                    key={document.id}
                    href={`/leerling/documenten/${document.id}`}
                    title={document.fileName}
                    subtitle={`${DOCUMENT_CATEGORY_LABEL[document.category]} · ${formatFileSize(document.sizeBytes)}`}
                    badge="Download"
                    badgeVariant="primary"
                    leading={<StudentInitialBadge label="DOC" tone="blue" />}
                  />
                ))
              ) : (
                <div className="rounded-[1.15rem] border border-dashed border-white/12 bg-white/[0.02] px-4 py-4 text-sm text-white/52">
                  Er staan nog geen schooldocumenten in je dossier.
                </div>
              )}
            </div>
          </StudentShowcaseCard>

          <StudentShowcaseCard
            title="Dossieroverzichten"
            eyebrow="Handige links"
            info="Open de andere onderdelen van je dossier zonder dubbele kopieën van dezelfde informatie."
          >
            <div className="space-y-2">
              <StudentListRow
                href="/leerling/betalingen"
                title="Facturen & betalingen"
                subtitle="Open je openstaande bedragen, betaalstatus en pakketoverzicht."
                meta={`${invoiceCount} facturen`}
                badge={invoiceCount > 0 ? "Open" : "Schoon"}
                badgeVariant={invoiceCount > 0 ? "warning" : "success"}
                leading={<StudentInitialBadge label="€" tone="orange" />}
              />
              <StudentListRow
                href="/leerling/examens"
                title="CBR & examens"
                subtitle="Machtiging, theorie en je volgende examenstap."
                badge={
                  cbrSummary?.preconditions.theorieBehaald
                    ? "Klaar"
                    : "Actie nodig"
                }
                badgeVariant={
                  cbrSummary?.preconditions.theorieBehaald
                    ? "success"
                    : "warning"
                }
                leading={<StudentInitialBadge label="CBR" tone="green" />}
              />
              <StudentListRow
                href="/leerling/lessen"
                title="Lesoverzicht"
                subtitle="Je lessen, planning en lesdetails."
                badge="Agenda"
                badgeVariant="primary"
                leading={<StudentInitialBadge label="Les" tone="blue" />}
              />
              <StudentListRow
                href="/leerling/theorie"
                title="Theorie voortgang"
                subtitle="Leer, oefen en houd huiswerk en toetsen samen."
                badge="Leren"
                badgeVariant="primary"
                leading={<StudentInitialBadge label="TH" tone="pink" />}
              />
            </div>
          </StudentShowcaseCard>
        </div>
      ) : null}

      {activeTab === "instellingen" ? (
        <div className="space-y-4">
          <StudentShowcaseCard
            title="Profiel"
            eyebrow="Jouw account"
            info="Je rijschool beheert de kerngegevens van je leerlingdossier. Hier zie je de huidige gegevens en regel je je app-voorkeuren."
          >
            <div className="flex items-start gap-4">
              <Avatar
                name={displayName}
                className="h-14 w-14 shrink-0 text-base"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold text-white">
                    {displayName}
                  </h2>
                  {student ? (
                    <Badge variant={student.active ? "success" : "outline"}>
                      {student.active ? "Actief" : "Inactief"}
                    </Badge>
                  ) : null}
                </div>
                <div className="text-xs text-white/46">{tenant.name}</div>
                <div className="mt-3 space-y-1.5 text-sm text-white/62">
                  <div>{student?.email ?? user.email}</div>
                  {student?.phone ? <div>{student.phone}</div> : null}
                  {student?.postcode ? <div>{student.postcode}</div> : null}
                </div>
              </div>
            </div>
          </StudentShowcaseCard>

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
            <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.02] px-3.5 py-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <Bell className="h-4 w-4 text-primary" aria-hidden />
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

          {isParent && otherChildren.length > 0 ? (
            <StudentShowcaseCard
              title="Wissel van leerling"
              eyebrow="Ouderaccount"
            >
              <Link
                href="/leerling/kies-leerling"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Andere leerling kiezen ({otherChildren.length})
              </Link>
            </StudentShowcaseCard>
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
        </div>
      ) : null}

      {activeTab === "contact" ? (
        <div className="space-y-4">
          <ContactCard
            schoolName={tenant.name}
            contactPhone={contactPhone}
            unreadCount={0}
          />

          <StudentShowcaseCard
            title="Direct contact"
            eyebrow="Rijschool"
            info="Voor lesvragen of pakketadvies is chat meestal het snelst. Voor formele vragen kun je bellen of mailen."
          >
            <div className="space-y-2">
              <StudentListRow
                href="/leerling/berichten"
                title="Chat met rijschool"
                subtitle="Stuur direct een bericht vanuit je leerlingapp."
                badge="Chat"
                badgeVariant="primary"
                leading={<StudentInitialBadge label="Chat" />}
              />
              {phoneHref ? (
                <StudentListRow
                  href={phoneHref}
                  title="Bel rijschool"
                  subtitle={contactPhone ?? "Telefonisch contact"}
                  badge="Bellen"
                  badgeVariant="success"
                  leading={<StudentInitialBadge label="Tel" tone="green" />}
                />
              ) : null}
              {supportEmail ? (
                <StudentListRow
                  href={`mailto:${supportEmail}`}
                  title="Mail rijschool"
                  subtitle={supportEmail}
                  badge="E-mail"
                  badgeVariant="outline"
                  leading={<StudentInitialBadge label="Mail" tone="blue" />}
                />
              ) : null}
            </div>
          </StudentShowcaseCard>

          <StudentShowcaseCard
            title="Hulp & uitleg"
            eyebrow="Veelgestelde vragen"
          >
            <div className="space-y-2">
              <StudentListRow
                title="Les verplaatsen"
                subtitle="Open je lessen of stuur een bericht naar je rijschool om een wijziging af te stemmen."
                leading={
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/14 text-primary">
                    <LifeBuoy className="h-5 w-5" aria-hidden />
                  </span>
                }
              />
              <StudentListRow
                title="Gegevens kloppen niet"
                subtitle="Je rijschool kan veilig je telefoonnummer, adres of dossierinstellingen aanpassen."
                leading={
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/14 text-primary">
                    <User className="h-5 w-5" aria-hidden />
                  </span>
                }
              />
              <StudentListRow
                title="Betalingsvraag"
                subtitle="Ga naar betalingen voor facturen en open bedragen, of neem contact op met de administratie."
                leading={
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/14 text-primary">
                    <FileStack className="h-5 w-5" aria-hidden />
                  </span>
                }
              />
            </div>
          </StudentShowcaseCard>

          <div className="px-1 text-xs text-white/42">
            {supportEmail ? (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {supportEmail}
              </span>
            ) : phoneHref ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {contactPhone}
              </span>
            ) : (
              "Gebruik chat om snel contact met je rijschool op te nemen."
            )}
          </div>
        </div>
      ) : null}
    </PWAPage>
  );
}
