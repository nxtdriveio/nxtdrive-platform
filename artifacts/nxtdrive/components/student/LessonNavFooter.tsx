import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Bottom navigation for the student lesson detail: previous / next lesson
 * (chronological) and a shortcut to contact the instructor. Links resolve to
 * existing routes only; a missing neighbour renders a disabled control.
 */
export function LessonNavFooter({
  prevLessonId,
  nextLessonId,
  contactHref,
}: {
  prevLessonId: string | null;
  nextLessonId: string | null;
  contactHref: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {prevLessonId ? (
          <Link
            href={`/student/lessons/${prevLessonId}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Vorige les
          </Link>
        ) : (
          <span
            aria-disabled
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "pointer-events-none opacity-40",
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Vorige les
          </span>
        )}
        {nextLessonId ? (
          <Link
            href={`/student/lessons/${nextLessonId}`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "justify-end",
            )}
          >
            Volgende les
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <span
            aria-disabled
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "pointer-events-none justify-end opacity-40",
            )}
          >
            Volgende les
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      <Link
        href={contactHref}
        className={cn(buttonVariants({ variant: "primary", size: "sm" }), "w-full")}
      >
        <MessageSquare className="h-4 w-4" aria-hidden />
        Bericht aan je instructeur
      </Link>
    </div>
  );
}
