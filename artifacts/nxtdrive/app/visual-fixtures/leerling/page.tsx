import { notFound } from "next/navigation";
import { BrandProvider } from "@/components/brand-provider";
import { StudentHomeDashboard } from "@/components/student/HomeDashboard";

export default function LearnerVisualFixturePage() {
  if (process.env["VISUAL_FIXTURES_ENABLED"] !== "true") {
    notFound();
  }

  return (
    <BrandProvider
      tenant={null}
      branding={null}
      forceLightTheme
      className="min-h-screen"
    >
      <main className="min-h-screen bg-brand-background px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[96rem]">
          <StudentHomeDashboard
            greeting="Goedemiddag"
            firstName="Mila"
            journeyPct={64}
            journeyStatus="Je bouwt rustig en gericht door."
            journeySteps={[
              { label: "Intake", status: "complete", value: "Afgerond" },
              { label: "Basisbediening", status: "complete", value: "Op niveau" },
              { label: "Verkeersdeelname", status: "active", value: "In ontwikkeling" },
              { label: "Zelfstandig rijden", status: "upcoming", value: "Volgende fase" },
            ]}
            sparklineValues={[38, 42, 47, 51, 58, 64]}
            nextLesson={{
              href: "/visual-fixtures/leerling",
              dayLabel: "Morgen",
              timeLabel: "10:15",
              primary: "Sanne de Vries",
              secondary: "Station Centrum",
              vehicle: "Volkswagen ID.3",
            }}
            examStatus={{
              href: "/visual-fixtures/leerling",
              readinessPct: 58,
              badgeLabel: "In opbouw",
              badgeVariant: "default",
              title: "Voorwaarden richting examen",
              detail: "Dekking is 72%; theorie nog niet als behaald geregistreerd.",
              eta: "Nog geen betrouwbare datum of lesinschatting",
            }}
            coach={{
              title: "Rotondes en kijkgedrag",
              body: "Voorgesteld op basis van je laatste beoordeling en je leerwens. Je instructeur bevestigt de focus.",
              ctaHref: "/visual-fixtures/leerling",
            }}
            messageUnreadCount={1}
            creditAvailableMinutes={630}
          />
        </div>
      </main>
    </BrandProvider>
  );
}
