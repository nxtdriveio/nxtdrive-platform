"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Lock,
  Send,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  publishRisLessonCardAction,
  setGuidedReflectionAction,
} from "@/lib/ris/actions";
import type {
  InstructorRisLessonCard,
  RisScriptAssessment,
} from "@/lib/ris/data";
import type { RISStepValue } from "@workspace/leskaart";

type ScriptMeta = {
  code: string;
  title: string;
  moduleNumber: number;
};

type Suggestion = {
  studentSummary: string;
  homework: string;
  internalSummary: string;
};

function stepLabel(step: RISStepValue | null): string {
  return step ? `Stap ${step}` : "Geen stap";
}

function clampText(value: string, max = 2000): string {
  return value.trim().slice(0, max);
}

function buildScriptMap(ris: InstructorRisLessonCard): Map<string, ScriptMeta> {
  const map = new Map<string, ScriptMeta>();
  for (const module of ris.catalog.tree) {
    for (const category of module.categories) {
      for (const script of category.scripts) {
        map.set(script.id, {
          code: script.code,
          title: script.title,
          moduleNumber: module.moduleNumber,
        });
      }
    }
  }
  return map;
}

function assessmentName(
  assessment: RisScriptAssessment,
  scriptMap: Map<string, ScriptMeta>,
): string {
  const meta = scriptMap.get(assessment.scriptId);
  return meta ? `${meta.code} ${meta.title}` : "RIS-script";
}

function buildSuggestion(
  assessments: RisScriptAssessment[],
  scriptMap: Map<string, ScriptMeta>,
): Suggestion {
  const focus = assessments
    .filter((item) => item.isFeaturedForLesson)
    .slice(0, 3)
    .map((item) => assessmentName(item, scriptMap));
  const attention = assessments
    .filter((item) => item.isAttentionPoint || item.shouldRepeat)
    .slice(0, 3)
    .map((item) => assessmentName(item, scriptMap));
  const treated = assessments.slice(0, 4).map((item) => assessmentName(item, scriptMap));

  const practiced = focus.length > 0 ? focus : treated;
  const practicedText =
    practiced.length > 0
      ? practiced.join(", ")
      : "de onderdelen die vandaag zijn behandeld";
  const nextText =
    attention.length > 0
      ? attention.join(", ")
      : "rustig verder oefenen op dezelfde lijn";

  return {
    studentSummary: `Je hebt vandaag gewerkt aan ${practicedText}. Je zet mooie stappen; we houden de volgende les vooral focus op ${nextText}.`,
    homework: `Neem voor de volgende les kort ${nextText} door. Dan pakken we het rustig en gericht weer op.`,
    internalSummary: `${assessments.length} RIS-script(s) beoordeeld. Focus: ${practicedText}. Volgende aandacht: ${nextText}.`,
  };
}

export function RisLessonPublicationPanel({
  lessonId,
  studentId,
  studentName,
  ris,
}: {
  lessonId: string;
  studentId: string;
  studentName: string;
  ris: InstructorRisLessonCard;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const scriptMap = useMemo(() => buildScriptMap(ris), [ris]);
  const conceptAssessments = useMemo(
    () => ris.assessments.filter((item) => item.conceptRisStep != null),
    [ris.assessments],
  );
  const suggestion = useMemo(
    () => buildSuggestion(conceptAssessments, scriptMap),
    [conceptAssessments, scriptMap],
  );

  const card = ris.card;
  const reflection = ris.reflection;
  const locked =
    card?.publicationStatus === "published" ||
    card?.publicationStatus === "archived";
  const canPublish = Boolean(card) && conceptAssessments.length > 0 && !locked;

  const [studentPresent, setStudentPresent] = useState(
    reflection?.studentPresent ?? true,
  );
  const [ratingOverall, setRatingOverall] = useState<number | null>(
    reflection?.ratingOverall ?? null,
  );
  const [ratingIndependence, setRatingIndependence] = useState<number | null>(
    reflection?.ratingIndependence ?? null,
  );
  const [wentWellText, setWentWellText] = useState(
    reflection?.wentWellText ?? "",
  );
  const [difficultText, setDifficultText] = useState(
    reflection?.difficultText ?? "",
  );
  const [nextLessonWish, setNextLessonWish] = useState(
    reflection?.nextLessonWish ?? "",
  );
  const [instructorContextNote, setInstructorContextNote] = useState(
    reflection?.instructorContextNote ?? "",
  );
  const [studentFriendlySummary, setStudentFriendlySummary] = useState(
    card?.studentFriendlySummary ?? suggestion.studentSummary,
  );
  const [homeworkOrNextFocus, setHomeworkOrNextFocus] = useState(
    card?.homeworkOrNextFocus ?? suggestion.homework,
  );
  const [internalSummary, setInternalSummary] = useState(
    card?.internalSummary ?? suggestion.internalSummary,
  );

  function publish() {
    if (!card) {
      setError("Maak eerst minimaal een RIS-conceptscore aan.");
      return;
    }
    if (conceptAssessments.length === 0) {
      setError("Publiceren kan pas zodra minimaal een script is beoordeeld.");
      return;
    }
    if (!studentFriendlySummary.trim()) {
      setError("Vul eerst een leerlingvriendelijke samenvatting in.");
      return;
    }

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const reflectionResult = await setGuidedReflectionAction({
        lessonCardId: card.id,
        studentPresent,
        ratingOverall,
        ratingIndependence,
        wentWellText: clampText(wentWellText),
        difficultText: clampText(difficultText),
        nextLessonWish: clampText(nextLessonWish),
        instructorContextNote: clampText(instructorContextNote),
      });
      if (reflectionResult.error) {
        setError(reflectionResult.error);
        return;
      }

      const publishResult = await publishRisLessonCardAction({
        lessonCardId: card.id,
        lessonId,
        studentId,
        internalSummary: clampText(internalSummary),
        studentFriendlySummary: clampText(studentFriendlySummary),
        homeworkOrNextFocus: clampText(homeworkOrNextFocus),
      });
      if (publishResult.error) {
        setError(publishResult.error);
        return;
      }

      setSuccess("RIS-leskaart is gepubliceerd naar de leerlingvoortgang.");
      router.refresh();
    });
  }

  return (
    <Card id="ris-publicatie" className="scroll-mt-24 overflow-hidden">
      <CardContent className="space-y-5 pt-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-primary">
              <ClipboardCheck className="h-4 w-4" aria-hidden />
              RIS-publicatie
            </div>
            <h2 className="mt-1 text-xl font-black text-foreground">
              Leskaart afronden voor {studentName}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Controleer de behandelde scripts, leg de reflectie vast en publiceer
              pas daarna de definitieve RIS-voortgang naar de leerling.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant={locked ? "success" : "outline"}>
              {locked ? "Gepubliceerd" : "Concept"}
            </Badge>
            <Badge variant={conceptAssessments.length > 0 ? "primary" : "warning"}>
              {conceptAssessments.length} score(s)
            </Badge>
            {ris.settings.aiAssistEnabled ? (
              <Badge variant="info" className="gap-1">
                <Sparkles className="h-3 w-3" aria-hidden />
                AI-voorstel
              </Badge>
            ) : null}
          </div>
        </div>

        {!card ? (
          <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            Maak eerst minimaal een conceptscore aan in de RIS-leskaart. Daarna
            verschijnt hier de publicatiecontrole.
          </div>
        ) : locked ? (
          <PublishedSummary card={card} />
        ) : (
          <>
            <section className="grid gap-3 lg:grid-cols-3">
              <PublicationCheck
                ok={conceptAssessments.length > 0}
                title="Scorecontrole"
                body={
                  conceptAssessments.length > 0
                    ? `${conceptAssessments.length} RIS-script(s) hebben een conceptscore.`
                    : "Nog geen conceptscore vastgelegd."
                }
              />
              <PublicationCheck
                ok={studentFriendlySummary.trim().length > 0}
                title="Leerlingtekst"
                body="De leerling ziet alleen deze coachende samenvatting en gepubliceerde scores."
              />
              <PublicationCheck
                ok
                title="Publicatie"
                body="Na publicatie worden conceptscores definitief en wordt leerlingvoortgang bijgewerkt."
              />
            </section>

            <section className="rounded-2xl border border-border bg-card/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-foreground">Behandelde scripts</h3>
                  <p className="text-sm text-muted-foreground">
                    Dit wordt bij publicatie omgezet naar definitieve RIS-voortgang.
                  </p>
                </div>
              </div>
              {conceptAssessments.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Nog geen behandelde scripts. Kies hierboven per RIS-script een stap.
                </p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {conceptAssessments.map((assessment) => {
                    const meta = scriptMap.get(assessment.scriptId);
                    return (
                      <div
                        key={assessment.id}
                        className="rounded-xl border border-border bg-muted/20 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {meta ? `Module ${meta.moduleNumber}` : "RIS"}
                          </span>
                          <Badge variant="primary">
                            {stepLabel(assessment.conceptRisStep)}
                          </Badge>
                        </div>
                        <div className="mt-2 text-sm font-bold text-foreground">
                          {meta?.title ?? "RIS-script"}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {assessment.isFeaturedForLesson ? (
                            <Badge variant="info">Focus</Badge>
                          ) : null}
                          {assessment.isAttentionPoint ? (
                            <Badge variant="warning">Aandacht</Badge>
                          ) : null}
                          {assessment.shouldRepeat ? (
                            <Badge variant="outline">Herhalen</Badge>
                          ) : null}
                          {assessment.readyForTest ? (
                            <Badge variant="success">Toetsklaar</Badge>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <div className="space-y-4 rounded-2xl border border-border bg-card/70 p-4">
                <div>
                  <h3 className="font-black text-foreground">Begeleide reflectie</h3>
                  <p className="text-sm text-muted-foreground">
                    Korte check-in voor leerling en instructeur aan het einde van de les.
                  </p>
                </div>

                <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <input
                    type="checkbox"
                    checked={studentPresent}
                    onChange={(event) => setStudentPresent(event.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Leerling was aanwezig bij de reflectie
                </label>

                <RatingRow
                  label="Algemene lesreflectie"
                  value={ratingOverall}
                  onChange={setRatingOverall}
                />
                <RatingRow
                  label="Zelfstandigheid"
                  value={ratingIndependence}
                  onChange={setRatingIndependence}
                />

                <LabeledTextarea
                  label="Wat ging goed?"
                  value={wentWellText}
                  onChange={setWentWellText}
                  placeholder="Bijvoorbeeld: rustig gekeken bij rotondes en betere voertuigbeheersing."
                />
                <LabeledTextarea
                  label="Wat was lastig?"
                  value={difficultText}
                  onChange={setDifficultText}
                  placeholder="Bijvoorbeeld: invoegen op drukke momenten vraagt nog herhaling."
                />
                <LabeledTextarea
                  label="Leerwens volgende les"
                  value={nextLessonWish}
                  onChange={setNextLessonWish}
                  placeholder="Bijvoorbeeld: nog een keer parkeren en verkeersinzicht in de wijk."
                />
              </div>

              <div className="space-y-4 rounded-2xl border border-border bg-card/70 p-4">
                <div>
                  <h3 className="font-black text-foreground">Publicatietekst</h3>
                  <p className="text-sm text-muted-foreground">
                    AI-assisted voorstel, maar de instructeur bevestigt en publiceert.
                  </p>
                </div>

                <LabeledTextarea
                  label="Leerlingvriendelijke samenvatting"
                  value={studentFriendlySummary}
                  onChange={setStudentFriendlySummary}
                  placeholder="Schrijf direct tegen de leerling: je hebt vandaag..."
                  rows={5}
                />
                <LabeledTextarea
                  label="Huiswerk / volgende focus"
                  value={homeworkOrNextFocus}
                  onChange={setHomeworkOrNextFocus}
                  placeholder="Wat mag de leerling meenemen naar de volgende les?"
                />
                <LabeledTextarea
                  label="Interne context"
                  value={internalSummary}
                  onChange={setInternalSummary}
                  placeholder="Alleen zichtbaar voor staff."
                />
                <LabeledTextarea
                  label="Interne instructeursnotitie"
                  value={instructorContextNote}
                  onChange={setInstructorContextNote}
                  placeholder="Context voor opvolging, planning of volgende instructeur."
                />
              </div>
            </section>

            {error ? (
              <div className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
                {error}
              </div>
            ) : null}
            {success ? (
              <div className="rounded-xl border border-success/40 bg-success/10 p-3 text-sm text-success">
                {success}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary-soft/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Publiceren maakt de conceptscores definitief. Daarna ziet de
                leerling de voortgang en kun je de les afronden.
              </div>
              <Button
                type="button"
                variant="primary"
                size="lg"
                disabled={!canPublish || isPending}
                onClick={publish}
                className="shrink-0"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                Publiceer leskaart
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PublishedSummary({
  card,
}: {
  card: NonNullable<InstructorRisLessonCard["card"]>;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="rounded-2xl border border-success/40 bg-success/10 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-success">
          <Lock className="h-4 w-4" aria-hidden />
          Gepubliceerd
        </div>
        <p className="text-sm text-muted-foreground">
          Deze RIS-leskaart is definitief en zichtbaar in de leerlingvoortgang.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-muted/20 p-4 lg:col-span-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Samenvatting leerling
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
          {card.studentFriendlySummary || "Geen samenvatting opgeslagen."}
        </p>
        {card.homeworkOrNextFocus ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {card.homeworkOrNextFocus}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PublicationCheck({
  ok,
  title,
  body,
}: {
  ok: boolean;
  title: string;
  body: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        ok
          ? "border-success/30 bg-success/5"
          : "border-warning/40 bg-warning/5",
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-black text-foreground">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
        ) : (
          <AlertCircle className="h-4 w-4 text-warning" aria-hidden />
        )}
        {title}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
        {Array.from({ length: 8 }, (_, index) => index + 1).map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => onChange(value === step ? null : step)}
            className={cn(
              "h-10 rounded-xl border text-sm font-black transition-colors",
              value === step
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground",
            )}
          >
            {step}
          </button>
        ))}
      </div>
    </div>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Textarea
        rows={rows}
        maxLength={2000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
