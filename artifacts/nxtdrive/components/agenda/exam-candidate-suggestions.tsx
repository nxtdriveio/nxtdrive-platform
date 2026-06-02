import Link from "next/link";
import { GraduationCap, Clock, Ban, TrendingUp } from "lucide-react";
import { ADVICE_LABELS } from "@workspace/leskaart";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { suggestExamCandidatesForSlot } from "@/lib/lesson-planning/exam-candidates";
import type { ExamSlotType } from "@/lib/lesson-planning/exam-candidates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatTegoed } from "@/lib/students/types";
import {
  CBR_EXAM_STATUS_LABEL,
  CBR_EXAM_STATUS_TONE,
  type CbrExamStatus,
  type CbrStatusTone,
} from "@/lib/cbr/derive";

// ---------------------------------------------------------------------------
// Task #101 — "Slimme examenkandidaat-voorstellen". For an available exam /
// interim-test moment, shows the best-fit existing students CBR-aware, ranked
// with reasoning, plus students blocked by an unmet CBR precondition (with the
// reason). Purely advisory + read-only: nothing is booked or invited here — the
// planner opens a dossier to decide. Reads only, tenant-scoped via RLS.
// ---------------------------------------------------------------------------

type Props = {
  tenantId: string;
  slotType: ExamSlotType;
  startsAt: string; // ISO
  durationMin: number;
  // The student already assigned to this moment (excluded from suggestions).
  excludeStudentId?: string | null;
};

const SLOT_NOUN: Record<ExamSlotType, string> = {
  exam: "examen",
  interim_test: "tussentijdse toets",
};

function adviceTone(
  advice: "niet_examenrijp" | "bijna_examenrijp" | "examenwaardig" | null,
): "default" | "warning" | "success" {
  if (advice === "examenwaardig") return "success";
  if (advice === "bijna_examenrijp") return "warning";
  return "default";
}

// Map the CBR status tone onto a Badge variant (Badge has no "neutral"/"info").
const STATUS_BADGE_VARIANT: Record<
  CbrStatusTone,
  "default" | "primary" | "success" | "warning" | "danger"
> = {
  neutral: "default",
  info: "primary",
  warning: "warning",
  success: "success",
  danger: "danger",
};

export async function ExamCandidateSuggestions({
  tenantId,
  slotType,
  startsAt,
  durationMin,
  excludeStudentId,
}: Props) {
  const supabase = await createServerSupabaseClient();
  const { eligible, blocked } = await suggestExamCandidatesForSlot(supabase, {
    tenantId,
    startsAt,
    durationMin,
    slotType,
    excludeStudentId,
  });

  const noun = SLOT_NOUN[slotType];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" aria-hidden />
          Geschikte kandidaten — {noun}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Adviserend — gerangschikt op examenrijpheid, eerder gezakt
          (herexamen), wachttijd, tegoed en beschikbaarheid. Voorwaarden
          (theorie, machtiging, gezondheidsverklaring, tegoed) zijn hard. Jij
          kiest en nodigt zelf uit; er wordt niets automatisch geboekt.
        </p>

        {/* Eligible candidates --------------------------------------------- */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Voorgestelde leerlingen
          </h3>
          {eligible.length === 0 ? (
            <p className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Geen leerlingen die aan alle examenvoorwaarden voldoen voor dit
              moment. Leerlingen die al geslaagd zijn, al een {noun} gepland
              hebben of al bezet zijn, worden niet voorgesteld.
            </p>
          ) : (
            <ul className="space-y-3">
              {eligible.map((c) => (
                <li
                  key={c.student_id}
                  className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {c.full_name}
                      </span>
                      <Badge variant="primary">{c.score} ptn</Badge>
                      {c.readiness_advice ? (
                        <Badge variant={adviceTone(c.readiness_advice)}>
                          {ADVICE_LABELS[c.readiness_advice]}
                        </Badge>
                      ) : null}
                      <Badge
                        variant={
                          STATUS_BADGE_VARIANT[
                            CBR_EXAM_STATUS_TONE[c.exam_status as CbrExamStatus]
                          ]
                        }
                      >
                        {CBR_EXAM_STATUS_LABEL[c.exam_status as CbrExamStatus]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{c.reason}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                        Saldo: {formatTegoed(c.balance_min)}
                      </span>
                      {c.readiness_pct !== null ? (
                        <span className="inline-flex items-center gap-1">
                          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                          Examenrijpheid: {c.readiness_pct}%
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Link
                    href={`/backoffice/leerlingen/${encodeURIComponent(c.student_id)}`}
                    className={buttonVariants({ size: "sm", variant: "outline" })}
                  >
                    Bekijk dossier →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Blocked students (unmet preconditions) -------------------------- */}
        {blocked.length > 0 ? (
          <div className="space-y-3">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Ban className="h-3.5 w-3.5" aria-hidden />
              Nog niet toelaatbaar
            </h3>
            <ul className="space-y-2">
              {blocked.map((c) => (
                <li
                  key={c.student_id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-foreground">
                      {c.full_name}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {c.blockers.map((b) => (
                        <Badge key={b} variant="warning">
                          {b}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Link
                    href={`/backoffice/leerlingen/${encodeURIComponent(c.student_id)}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Open dossier →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
