"use client";

import { useState, useTransition } from "react";
import { BookOpen, CheckCircle2, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { markHomeworkStatusAction } from "@/app/student/actions";
import {
  THEORY_HOMEWORK_STATUS_LABEL,
  THEORY_HOMEWORK_STATUS_VARIANT,
  type TheoryHomeworkWithModule,
} from "@/lib/theory/types";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
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
    const fd = new FormData();
    fd.set("homework_id", homeworkId);
    fd.set("status", status);
    setError(null);
    startTransition(async () => {
      const res = await markHomeworkStatusAction(fd);
      if (res?.error) setError(res.error);
    });
  }

  const visible = homework.filter((hw) => hw.status !== "cancelled");

  if (visible.length === 0) {
    if (!emptyHint) return null;
    return (
      <Card>
        <CardContent className="space-y-2 pt-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <BookOpen className="h-4 w-4" aria-hidden /> Theoriehuiswerk
          </div>
          <p className="text-sm text-muted-foreground">
            Je hebt op dit moment geen openstaand theoriehuiswerk.
          </p>
        </CardContent>
      </Card>
    );
  }

  const now = Date.now();

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <BookOpen className="h-4 w-4" aria-hidden /> Theoriehuiswerk
        </div>

        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        <ol className="space-y-2">
          {visible.map((hw) => {
            const overdue =
              hw.status === "open" &&
              hw.deadline != null &&
              new Date(hw.deadline).getTime() < now;
            return (
              <li
                key={hw.id}
                className="rounded-md border border-border bg-card/50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">
                      {hw.moduleTitle}
                    </div>
                    {hw.deadline ? (
                      <div
                        className={
                          overdue
                            ? "text-xs font-medium text-danger"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        Deadline: {dateFmt.format(new Date(hw.deadline))}
                        {overdue ? " — verlopen" : ""}
                      </div>
                    ) : null}
                    {hw.note ? (
                      <p className="text-xs text-muted-foreground">{hw.note}</p>
                    ) : null}
                  </div>
                  <Badge variant={THEORY_HOMEWORK_STATUS_VARIANT[hw.status]}>
                    {THEORY_HOMEWORK_STATUS_LABEL[hw.status]}
                  </Badge>
                </div>
                <div className="mt-2 flex justify-end">
                  {hw.status === "done" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setStatus(hw.id, "open")}
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      Toch nog niet af
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => setStatus(hw.id, "done")}
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
      </CardContent>
    </Card>
  );
}
