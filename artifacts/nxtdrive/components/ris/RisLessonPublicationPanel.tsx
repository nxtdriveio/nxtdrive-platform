"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Lock,
  MessageSquareText,
  Send,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  generateRisLessonAiDraftAction,
  publishRisLessonCardAction,
  saveRisLessonCardDraftAction,
  setGuidedReflectionAction,
} from "@/lib/ris/actions";
import type {
  InstructorRisLessonCard,
  RisReflectionRating,
  RisScriptAssessment,
} from "@/lib/ris/data";
import { RIS_REFLECTION_RATING_LABELS } from "@/lib/ris/data";
import type { RISStepValue } from "@workspace/leskaart";

type PublicationMode = "reflection" | "summary";

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
  return step ? `Score ${step}/10` : "Geen score";
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
  mode = "summary",
}: {
  lessonId: string;
  studentId: string;
  studentName: string;
  ris: InstructorRisLessonCard;
  mode?: PublicationMode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    ris.card ? "saved" : "idle",
  );
  const [cardId, setCardId] = useState(ris.card?.id ?? null);
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

  const draftSignature = JSON.stringify({
    studentFriendlySummary,
    homeworkOrNextFocus,
    internalSummary,
  });
  const reflectionSignature = JSON.stringify({
    studentPresent,
    overallRating,
    independenceRating,
    insightRating,
    confidenceRating,
    oneSentenceReflection,
    instructorContextNote,
  });
  const lastDraftSignature = useRef(draftSignature);
  const lastReflectionSignature = useRef(reflectionSignature);

  async function ensureCard() {
    if (cardId) return cardId;
    const result = await saveRisLessonCardDraftAction({ lessonId });
    if ("error" in result && result.error) {
      setError(result.error);
      return null;
    }
    const nextCardId = "lessonCardId" in result ? result.lessonCardId : undefined;
    if (!nextCardId) {
      setError("RIS-leskaart kon niet als concept worden opgeslagen.");
      return null;
    }
    setCardId(nextCardId);
    return nextCardId;
  }

  useEffect(() => {
    if (locked || mode !== "summary") return;
    if (draftSignature === lastDraftSignature.current) return;
    setSaveState("saving");
    setError(null);
    const timer = window.setTimeout(async () => {
      const result = await saveRisLessonCardDraftAction({
        lessonId,
        internalSummary,
        studentFriendlySummary,
        homeworkOrNextFocus,
      });
      if ("error" in result && result.error) {
        setError(result.error);
        setSaveState("idle");
        return;
      }
      const nextCardId = "lessonCardId" in result ? result.lessonCardId : undefined;
      if (nextCardId) setCardId(nextCardId);
      lastDraftSignature.current = draftSignature;
      setSaveState("saved");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    draftSignature,
    homeworkOrNextFocus,
    internalSummary,
    lessonId,
    locked,
    mode,
    studentFriendlySummary,
  ]);

  useEffect(() => {
    if (locked || mode !== "reflection") return;
    if (reflectionSignature === lastReflectionSignature.current) return;
    setSaveState("saving");
    setError(null);
    const timer = window.setTimeout(async () => {
      const nextCardId = await ensureCard();
      if (!nextCardId) {
        setSaveState("idle");
        return;
      }
      const result = await setGuidedReflectionAction({
        lessonCardId: nextCardId,
        lessonId,
        studentPresent,
        overallRating,
        independenceRating,
        insightRating,
        confidenceRating,
        oneSentenceReflection: clampText(oneSentenceReflection, 500),
        instructorContextNote: clampText(instructorContextNote),
      });
      if ("error" in result && result.error) {
        setError(result.error);
        setSaveState("idle");
        return;
      }
      lastReflectionSignature.current = reflectionSignature;
      setSaveState("saved");
    }, 900);
    return () => window.clearTimeout(timer);
    // ensureCard intentionally uses current cardId without making every cardId
    // update restart the debounce timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    confidenceRating,
    independenceRating,
    insightRating,
    instructorContextNote,
    lessonId,
    locked,
    mode,
    oneSentenceReflection,
    overallRating,
    reflectionSignature,
    studentPresent,
  ]);

  const canPublish =
    conceptAssessments.length > 0 &&
    !locked &&
    Boolean(studentFriendlySummary.trim()) &&
    Boolean(oneSentenceReflection.trim());

  function publish() {
    if (conceptAssessments.length === 0) {
      setError("Publiceren kan pas zodra minimaal een script is beoordeeld.");
      return;
    }
    if (!studentFriendlySummary.trim()) {
      setError("Vul eerst een leerlingvriendelijke samenvatting in.");
      return;
    }
    if (!oneSentenceReflection.trim()) {
      setError("Vul de gezamenlijke reflectie in een korte zin in.");
      return;
    }
    const confirmed = window.confirm(
      "Weet je zeker dat je deze leskaart definitief wilt afronden en publiceren? Daarna worden de scores vastgezet en kan deze leskaart niet meer direct worden bewerkt.",
    );
    if (!confirmed) return;

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const nextCardId = await ensureCard();
      if (!nextCardId) return;

      const draftResult = await saveRisLessonCardDraftAction({
        lessonId,
        internalSummary,
        studentFriendlySummary,
        homeworkOrNextFocus,
      });
      if ("error" in draftResult && draftResult.error) {
        setError(draftResult.error);
        return;
      }

      const reflectionResult = await setGuidedReflectionAction({
        lessonCardId: nextCardId,
        lessonId,
        studentPresent,
        overallRating,
        independenceRating,
        insightRating,
        confidenceRating,
        oneSentenceReflection: clampText(oneSentenceReflection, 500),
        instructorContextNote: clampText(instructorContextNote),
      });
      if ("error" in reflectionResult && reflectionResult.error) {
        setError(reflectionResult.error);
        return;
      }

      const publishResult = await publishRisLessonCardAction({
        lessonCardId: nextCardId,
        lessonId,
        studentId,
        internalSummary: clampText(internalSummary),
        studentFriendlySummary: clampText(studentFriendlySummary),
        homeworkOrNextFocus: clampText(homeworkOrNextFocus),
      });
      if ("error" in publishResult && publishResult.error) {
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
      const ensured = await ensureCard();
      if (!ensured) return;
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

  if (mode === "reflection") {
    return (
      <Card id="ris-reflectie" className="scroll-mt-24 overflow-hidden">
        <CardContent className="space-y-5 pt-5">
          <PanelHeader
            icon={MessageSquareText}
            eyebrow="Reflectie"
            title={`Reflectie met ${studentName}`}
            description="Leg de zelfreflectie van de leerling vast. Concepten worden automatisch opgeslagen."
            status={<SaveStatus state={saveState} locked={locked} />}
          />

          {locked && card ? <PublishedSummary card={card} /> : null}

          <section className="space-y-4 rounded-2xl border border-border bg-card/70 p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <input
                type="checkbox"
                checked={studentPresent}
                disabled={locked}
                onChange={(event) => setStudentPresent(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Leerling was aanwezig bij de reflectie
            </label>

            <RatingRow
              label="Algemene reflectie"
              value={overallRating}
              onChange={setOverallRating}
              disabled={locked}
            />
            <RatingRow
              label="Zelfstandigheid"
              value={independenceRating}
              onChange={setIndependenceRating}
              disabled={locked}
            />
            <RatingRow
              label="Inzicht"
              value={insightRating}
              onChange={setInsightRating}
              disabled={locked}
            />
            <RatingRow
              label="Vertrouwen"
              value={confidenceRating}
              onChange={setConfidenceRating}
              disabled={locked}
            />

            <LabeledTextarea
              label="Reflectie in een zin"
              value={oneSentenceReflection}
              onChange={setOneSentenceReflection}
              disabled={locked}
              placeholder="Bijvoorbeeld: Ik keek rustiger vooruit en hield beter overzicht bij rotondes."
              rows={3}
            />
            <LabeledTextarea
              label="Interne instructeursnotitie"
              value={instructorContextNote}
              onChange={setInstructorContextNote}
              disabled={locked}
              placeholder="Context voor opvolging, planning of volgende instructeur."
            />
          </section>

          <Feedback error={error} success={success} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="ris-publicatie" className="scroll-mt-24 overflow-hidden">
      <CardContent className="space-y-5 pt-5">
        <PanelHeader
          icon={ClipboardCheck}
          eyebrow="Afronding"
          title={`Leskaart afronden voor ${studentName}`}
          description="Controleer de behandelde scripts, reflectie en leerlingtekst voordat je publiceert."
          status={<SaveStatus state={saveState} locked={locked} />}
        />

        {locked && card ? (
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
                ok={oneSentenceReflection.trim().length > 0}
                title="Reflectie"
                body="De reflectie is intern opgeslagen en wordt meegenomen in het lesverslag."
              />
              <PublicationCheck
                ok={studentFriendlySummary.trim().length > 0}
                title="Leerlingtekst"
                body="De leerling ziet alleen de coachende samenvatting en gepubliceerde scores."
              />
            </section>

            <section className="rounded-2xl border border-border bg-card/70 p-4">
              <h3 className="font-black text-foreground">Gewijzigde scripts</h3>
              <p className="text-sm text-muted-foreground">
                Deze concepten worden bij publicatie definitief in de RIS-voortgang.
              </p>
              {conceptAssessments.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Nog geen behandelde scripts. Kies op tabblad Beoordeling per RIS-script een stap.
                </p>
              ) : (
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {conceptAssessments.map((assessment) => {
                    const meta = scriptMap.get(assessment.scriptId);
                    return (
                      <div
                        key={assessment.id}
                        className="rounded-xl border border-border bg-muted/20 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">
                            {meta ? `Module ${meta.moduleNumber}` : "RIS"}
                          </span>
                          <Badge variant="primary">
                            {stepLabel(assessment.conceptRisStep)}
                          </Badge>
                        </div>
                        <div className="mt-2 text-sm font-bold text-foreground">
                          {meta ? `${meta.code}: ${meta.title}` : "RIS-script"}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {assessment.isFeaturedForLesson ? <Badge variant="info">Focus</Badge> : null}
                          {assessment.isAttentionPoint ? <Badge variant="warning">Aandacht</Badge> : null}
                          {assessment.shouldRepeat ? <Badge variant="outline">Herhalen</Badge> : null}
                          {assessment.readyForTest ? <Badge variant="success">Toetsklaar</Badge> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
              <div className="space-y-3 rounded-2xl border border-border bg-card/70 p-4">
                <h3 className="font-black text-foreground">Reflectie leerling</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  {oneSentenceReflection.trim() || "Nog geen reflectie ingevuld."}
                </p>
                <div className="grid gap-2 text-sm">
                  <MiniRating label="Algemeen" value={overallRating} />
                  <MiniRating label="Zelfstandigheid" value={independenceRating} />
                  <MiniRating label="Inzicht" value={insightRating} />
                  <MiniRating label="Vertrouwen" value={confidenceRating} />
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-border bg-card/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-black text-foreground">Samenvatting</h3>
                    <p className="text-sm text-muted-foreground">
                      Schrijf zelf, laat AI een voorstel doen, en bewerk daarna vrij.
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
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Sparkles className="h-4 w-4" aria-hidden />
                      )}
                      AI-voorstel
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
              </div>
            </section>

            <Feedback error={error} success={success} />

            <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary-soft/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Publiceren maakt de conceptscores definitief. Daarna ziet de leerling
                de voortgang en kan hij of zij een korte reactie of leerwens invullen.
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
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                Afronden & publiceren
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PanelHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  status,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  status?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs uppercase text-primary">
          <Icon className="h-4 w-4" aria-hidden />
          {eyebrow}
        </div>
        <h2 className="mt-1 text-xl font-black text-foreground">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {status}
    </div>
  );
}

function SaveStatus({
  state,
  locked,
}: {
  state: "idle" | "saving" | "saved";
  locked: boolean;
}) {
  if (locked) return <Badge variant="success">Gepubliceerd</Badge>;
  if (state === "saving") return <Badge variant="primary">Concept opslaan...</Badge>;
  if (state === "saved") return <Badge variant="success">Concept opgeslagen</Badge>;
  return <Badge variant="outline">Concept</Badge>;
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
        <div className="text-xs uppercase text-muted-foreground">
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
  disabled,
}: {
  label: string;
  value: RisReflectionRating | null;
  onChange: (value: RisReflectionRating | null) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-5">
        {RATING_OPTIONS.map((rating) => (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === rating ? null : rating)}
            className={cn(
              "min-h-10 rounded-xl border px-2 py-2 text-xs font-black transition-colors",
              value === rating
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            {RIS_REFLECTION_RATING_LABELS[rating]}
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniRating({
  label,
  value,
}: {
  label: string;
  value: RisReflectionRating | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold text-foreground">
        {value ? RIS_REFLECTION_RATING_LABELS[value] : "Nog niet ingevuld"}
      </span>
    </div>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </span>
      <Textarea
        rows={rows}
        maxLength={2000}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function Feedback({
  error,
  success,
}: {
  error: string | null;
  success: string | null;
}) {
  if (!error && !success) return null;
  return (
    <>
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
    </>
  );
}
