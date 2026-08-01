import { FileQuestion, LifeBuoy, MessageCircle, UserRound } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadContactPhone } from "@/lib/tenant/contact-phone";
import { loadOrganizationProfile } from "@/lib/organization/profile";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import { ContactCard } from "@/components/student/ContactCard";
import {
  StudentInitialBadge,
  StudentListRow,
  StudentShowcaseCard,
} from "@/components/student/Showcase";

export const dynamic = "force-dynamic";

export default async function StudentHelpPage() {
  const { tenant } = await requireActiveTenant(["student", "parent"]);
  const supabase = await createServerSupabaseClient();
  const [organization, contactPhone] = await Promise.all([
    loadOrganizationProfile(supabase, tenant.id),
    loadContactPhone(supabase, tenant.id),
  ]);
  const supportEmail =
    organization?.support_email ?? organization?.billing_email ?? null;

  return (
    <PWAPage app="student" contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Meer"
        title="Hulp & uitleg"
        subtitle="Uitleg over lessen en je dossier, plus direct contact met je rijschool."
        icon={<LifeBuoy className="h-4 w-4" aria-hidden />}
      />

      <ContactCard
        schoolName={tenant.name}
        contactPhone={contactPhone}
        unreadCount={0}
      />

      <StudentShowcaseCard
        title="Direct contact"
        eyebrow="Rijschool"
        info="Gebruik chat voor lesvragen of het doorgeven van gewijzigde gegevens."
      >
        <div className="space-y-2">
          <StudentListRow
            href="/leerling/berichten"
            title="Chat met je rijschool"
            subtitle="Stuur veilig een bericht vanuit de leerlingapp."
            badge="Chat"
            badgeVariant="primary"
            leading={<StudentInitialBadge label="Chat" />}
          />
          {supportEmail ? (
            <StudentListRow
              href={`mailto:${supportEmail}`}
              title="E-mail de rijschool"
              subtitle={supportEmail}
              badge="E-mail"
              badgeVariant="outline"
              leading={<StudentInitialBadge label="Mail" tone="blue" />}
            />
          ) : null}
        </div>
      </StudentShowcaseCard>

      <StudentShowcaseCard title="Veelgestelde vragen" eyebrow="Uitleg">
        <div className="space-y-2">
          <StudentListRow
            href="/leerling/lessen"
            title="Een les terugvinden of verplaatsen"
            subtitle="Open Lessen voor je planning en historie. Bespreek wijzigingen via Berichten."
            badge="Lessen"
            badgeVariant="primary"
            leading={<StudentInitialBadge label="Les" tone="blue" />}
          />
          <StudentListRow
            href="/leerling/account"
            title="Persoons- of adresgegevens bekijken"
            subtitle="Account toont je persoonsgegevens, woonadres en vaste of tijdelijke ophaallocatie."
            badge="Account"
            badgeVariant="outline"
            leading={<UserRound className="h-5 w-5" aria-hidden />}
          />
          <StudentListRow
            href="/leerling/documenten"
            title="Een document openen"
            subtitle="Documenten bevat alleen de beveiligde bestanden uit je leerlingdossier."
            badge="Documenten"
            badgeVariant="outline"
            leading={<FileQuestion className="h-5 w-5" aria-hidden />}
          />
          <StudentListRow
            href="/leerling/berichten"
            title="Gegevens kloppen niet"
            subtitle="Stuur de correctie via chat, zodat je rijschool je dossier en planning gelijk kan bijwerken."
            badge="Bericht"
            badgeVariant="warning"
            leading={<MessageCircle className="h-5 w-5" aria-hidden />}
          />
        </div>
      </StudentShowcaseCard>
    </PWAPage>
  );
}
