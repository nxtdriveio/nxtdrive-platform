import { InstructorSimpleView } from "@/components/instructor/RedesignViews";

export const dynamic = "force-dynamic";

export default function InstructorReleaseNotesPage() {
  return (
    <InstructorSimpleView
      eyebrow="Product"
      title="Release notes"
      subtitle="Lees wat er voor instructeurs is verbeterd en welke functies klaarstaan voor de pilot."
    />
  );
}
