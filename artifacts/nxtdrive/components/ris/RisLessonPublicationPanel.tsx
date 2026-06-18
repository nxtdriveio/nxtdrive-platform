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
  generateRisLessonAiDraftAction,
  publishRisLessonCardAction,
  setGuidedReflectionAction,
} from "@/lib/ris/actions";
import type {
  InstructorRisLessonCard,
  RisReflectionRating,
  RisScriptAssessment,
} from "@/lib/ris/data";
import { RIS_REFLECTION_RATING_LABELS } from "@/lib/ris/data";
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
  oneSentence: string;
};

const OPEN_PUBLICATION_STATUSES = new Set([
  "draft",
  "completion_in_progress",
  "ready_to_publish",
]);

const RATING_OPTIONS: RisReflectionRating[] = [
  "very_insufficient",
  "insufficient",
  "moderate",
  "sufficient",
  "very_sufficient",
];

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
    oneSentence: `Je hebt gericht geoefend met ${practicedText} en neemt ${nextText} mee naar de volgende les.`,
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
  const [aiError, setAiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isAiPending, startAiTransition] = useTransition();

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
  const locked = card ? !OPEN_PUBLICATION_STATUSES.has(card.publicationStatus) : false;

  const [studentPresent, setStudentPresent] = useState(
    reflection?.studentPresent ?? true,
  );
  const [overallRating, setOverallRating] = useState<RisReflectionRating | null>(
    reflection?.overallRating ?? null,
  );
  const [independenceRating, setIndependenceRating] = useState<RisReflectionRating | null>(
    reflection?.independenceRating ?? null,
  );
  const [insightRating, setInsightRating] = useState<RisReflectionRating | null>(
    reflection?.insightRating ?? null,
  );
  const [confidenceRating, setConfidenceRating] = useState<RisReflectionRating | null>(
    reflection?.confidenceRating ?? null,
  );
  const [oneSentenceReflection, setOneSentenceReflection] = useState(
    reflection?.oneSentenceReflection ?? suggestion.oneSentence,
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
  const canPublish =
    Boolean(card) &&
    conceptAssessments.length > 0 &&
    !locked &&
    Boolean(studentFriendlySummary.trim()) &&
    Boolean(oneSentenceReflection.trim());

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
    if (!oneSentenceReflection.trim()) {
      setError("Vul de gezamenlijke reflectie in één korte zin in.");
      return;
    }

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const reflectionResult = await setGuidedReflectionAction({
        lessonCardId: card.id,
        lessonId,
        studentPresent,
        overallRating,
        independenceRating,
        insightRating,
        confidenceRating,
        oneSentenceReflection: clampText(oneSentenceReflection, 500),
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

  function generateAiDraft() {
    setAiError(null);
    setSuccess(null);
    startAiTransition(async () => {
      const result = await generateRisLessonAiDraftAction({ lessonId });
      if ("error" in result && result.error) {
        setAiError(result.error);
        return;
      }
      const draft = "draft" in result ? result.draft : undefined;
      if (!draft) {
        setAiError("De AI gaf geen bruikbaar RIS-voorstel terug.");
        return;
      }
      setStudentFriendlySummary(draft.studentSummary || suggestion.studentSummary);
      setHomeworkOrNextFocus(draft.homeworkOrNextFocus || suggestion.homework);
      setInternalSummary(draft.internalSummary || suggestion.internalSummary);
      if (draft.internalAttentionPoints.length > 0) {
        setInstructorContextNote(draft.internalAttentionPoints.join("\n"));
      }
      if (!oneSentenceReflection.trim()) {
        setOneSentenceReflection(suggestion.oneSentence);
      }
      setSuccess("AI-voorstel geladen. Controleer en pas aan voordat je publiceert.");
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
                  label="Algemene reflectie"
                  value={overallRating}
                  onChange={setOverallRating}
                />
                <RatingRow
                  label="Zelfstandigheid"
                  value={independenceRating}
                  onChange={setIndependenceRating}
                />
                <RatingRow
                  label="Inzicht"
                  value={insightRating}
                  onChange={setInsightRating}
                />
                <RatingRow
                  label="Vertrouwen"
                  value={confidenceRating}
                  onChange={setConfidenceRating}
                />

                <LabeledTextarea
                  label="Reflectie in één zin"
                  value={oneSentenceReflection}
                  onChange={setOneSentenceReflection}
                  placeholder="Bijvoorbeeld: Ik keek rustiger vooruit en hield beter overzicht bij rotondes."
                  rows={3}
                />
              </div>

              <div className="space-y-4 rounded-2xl border border-border bg-card/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-black text-foreground">Publicatietekst</h3>
                    <p className="text-sm text-muted-foreground">
                      AI-assisted voorstel, maar de instructeur bevestigt en publiceert.
                    </p>
                  </div>
                  {ris.settings.aiAssistEnabled ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={generateAiDraft}
                      disabled={isAiPending || conceptAssessments.length === 0}
                      className="shrink-0"
                    >
                      {isAiPending ? (
                        <Loader2 className="h-4 w-4" aria-hidden />
                      ) : (
                        <Sparkles className="h-4 w-4" aria-hidden />
                      )}
                      {isAiPending ? "AI denkt mee..." : "Genereer AI-voorstel"}
                    </Button>
                  ) : null}
                </div>

                {aiError ? (
                  <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
                    {aiError}
                  </div>
                ) : null}

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
                leerling de voortgang en vraagt NXTDRIVE om een korte reactie
                of leerwens; daarna is de RIS-leskaart volledig afgerond.
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
  const isDone = card.publicationStatus === "fully_completed";
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="rounded-2xl border border-success/40 bg-success/10 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-success">
          <Lock className="h-4 w-4" aria-hidden />
          {isDone ? "Volledig afgerond" : "Gepubliceerd"}
        </div>
        <p className="text-sm text-muted-foreground">
          {isDone
            ? "De leerling heeft gereageerd of bewust overgeslagen. Deze RIS-leskaart is compleet."
            : "Deze RIS-leskaart is zichtbaar voor de leerling en wacht eventueel nog op een korte leerlingreactie."}
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
  value: RisReflectionRating | null;
  onChange: (value: RisReflectionRating | null) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-5">
        {RATING_OPTIONS.map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => onChange(value === rating ? null : rating)}
            className={cn(
              "min-h-10 rounded-xl border px-2 py-2 text-xs font-black transition-colors",
              value === rating
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground",
            )}
          >
            {RIS_REFLECTION_RATING_LABELS[rating]}
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
