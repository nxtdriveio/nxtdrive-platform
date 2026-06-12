import { Lightbulb } from "lucide-react";
import { StudentShowcaseNotice } from "@/components/student/Showcase";

export function LessonAdviceCard({ advice }: { advice: string | null }) {
  if (!advice) return null;

  return (
    <StudentShowcaseNotice
      tone="info"
      title="Advies van je instructeur"
      description={advice}
      icon={<Lightbulb className="h-5 w-5" aria-hidden />}
      className="border-primary/20"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--primary) 18%, rgba(35,26,68,0.92)), rgba(13,13,25,0.98))",
      }}
    />
  );
}
