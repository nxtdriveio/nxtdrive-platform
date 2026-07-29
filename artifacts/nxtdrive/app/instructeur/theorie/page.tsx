import { InstructorSimpleView } from "@/components/instructor/RedesignViews";

export const dynamic = "force-dynamic";

export default function InstructorTheoryPage() {
  return (
    <InstructorSimpleView
      eyebrow="Theorie"
      title="Theoriebegeleiding"
      subtitle="Bekijk huiswerk, bespreek leerdoelen en houd praktijk en theorie op elkaar aangesloten."
    />
  );
}
