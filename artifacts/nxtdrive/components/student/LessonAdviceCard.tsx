import { Lightbulb } from "lucide-react";
import {
  STUDENT_ACCENT_SURFACE,
  StudentShowcaseNotice,
} from "@/components/student/Showcase";

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
        background: STUDENT_ACCENT_SURFACE,
      }}
    />
  );
}
