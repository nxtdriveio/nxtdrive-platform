import { notFound } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { BrandProvider } from "@/components/brand-provider";
import { StudentBottomNav } from "@/components/student/BottomNav";
import {
  StudentMoreMenu,
  StudentPageHeader,
  StudentSection,
} from "@/components/student/StudentPwa";

export default function LearnerMoreVisualFixturePage() {
  if (process.env["VISUAL_FIXTURES_ENABLED"] !== "true") {
    notFound();
  }

  return (
    <BrandProvider
      tenant={null}
      branding={null}
      forceLightTheme
      className="min-h-screen bg-brand-background"
    >
      <main className="mx-auto min-h-screen w-full max-w-[430px] px-4 pb-32 pt-6">
        <div className="min-w-0 space-y-4">
          <StudentPageHeader
            eyebrow="Meer"
            title="Alles op een plek"
            subtitle="Account, berichten, hulp, documenten en instellingen."
          />
          <StudentSection title="Menu" icon={MoreHorizontal}>
            <StudentMoreMenu />
          </StudentSection>
        </div>
      </main>
      <StudentBottomNav />
    </BrandProvider>
  );
}
