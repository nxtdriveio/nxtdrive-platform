import { InstructorSimpleView } from "@/components/instructor/RedesignViews";

export const dynamic = "force-dynamic";

export default function InstructorHelpPage() {
  return (
    <InstructorSimpleView
      eyebrow="Ondersteuning"
      title="Help"
      subtitle="Vind uitleg over je lesdag, leerlingdossiers, lesevaluaties en offline concepten."
    />
  );
}
