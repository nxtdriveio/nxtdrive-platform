"use client";

import { useState, useTransition } from "react";
import { BookOpen, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StudentShowcaseCard,
  StudentShowcaseEmptyState,
  StudentShowcaseNotice,
} from "@/components/student/Showcase";
import { markHomeworkStatusAction } from "@/app/student/actions";
import {
  THEORY_HOMEWORK_STATUS_LABEL,
  THEORY_HOMEWORK_STATUS_VARIANT,
  type TheoryHomeworkWithModule,
} from "@/lib/theory/types";
import { createNlDateTimeFormatter } from "@/lib/datetime";

const dateFmt = createNlDateTimeFormatter({
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function StudentTheoryHomeworkCard({
  homework,
  emptyHint = true,
}: {
  homework: TheoryHomeworkWithModule[];
  emptyHint?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setStatus(homeworkId: string, status: "open" | "done") {
    const formData = new FormData();
    formData.set("homework_id", homeworkId);
    formData.set("status", status);
    setError(null);
    startTransition(async () => {
      const result = await markHomeworkStatusAction(formData);
      if (result?.error) setError(result.error);
    });
  }

  const visible = homework.filter((item) => item.status !== "cancelled");
  if (visible.length === 0) {
    if (!emptyHint) return null;
    return (
      <StudentShowcaseCard title="Theoriehuiswerk" eyebrow="Opdrachten">
        <StudentShowcaseEmptyState
          title="Geen huiswerk"
          description="Je hebt op dit moment geen openstaand theoriehuiswerk."
          icon={<BookOpen className="h-5 w-5" aria-hidden />}
        />
      </StudentShowcaseCard>
    );
  }

  const now = Date.now();

  return (
    <StudentShowcaseCard
      title="Theoriehuiswerk"
      eyebrow="Opdrachten"
      info="Werk je opdrachten af in je eigen tempo en markeer ze zodra je klaar bent."
    >
      <div className="space-y-3">
        {error ? (
          <StudentShowcaseNotice
            tone="danger"
            title="Bijwerken lukt nu niet"
            description={error}
            icon={<BookOpen className="h-5 w-5" aria-hidden />}
          />
        ) : null}

        <ol className="space-y-2">
          {visible.map((item) => {
            const overdue =
              item.status === "open" &&
              item.deadline != null &&
              new Date(item.deadline).getTime() < now;

            return (
              <li
                key={item.id}
                className="rounded-[1.15rem] border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-white">{item.moduleTitle}</div>
                    {item.deadline ? (
                      <div className={overdue ? "text-xs text-rose-300" : "text-xs text-white/46"}>
                        Deadline: {dateFmt.format(new Date(item.deadline))}
                        {overdue ? " · verlopen" : ""}
                      </div>
                    ) : null}
                    {item.note ? (
                      <p className="text-xs leading-5 text-white/52">{item.note}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0">
                    <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[11px] text-white/70">
                      {THEORY_HOMEWORK_STATUS_LABEL[item.status]}
                    </span>
                  </span>
                </div>

                <div className="mt-3 flex justify-end">
                  {item.status === "done" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-white/70 hover:bg-white/10 hover:text-white"
                      disabled={pending}
                      onClick={() => setStatus(item.id, "open")}
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      Toch nog niet af
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => setStatus(item.id, "done")}
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      Markeer als afgerond
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </StudentShowcaseCard>
  );
}
