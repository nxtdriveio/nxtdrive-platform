"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardList,
  FileText,
  Flag,
  MapPin,
  MessageSquareText,
  Target,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { InstructorPlanningCardPanel } from "@/components/ris/InstructorPlanningCardPanel";
import { EndOfLessonSchedulingPanel } from "@/components/ris/EndOfLessonSchedulingPanel";
import { RisLessonPublicationPanel } from "@/components/ris/RisLessonPublicationPanel";
import { RisScriptScoring } from "@/components/ris/RisScriptScoring";
import type { EndOfLessonSchedulingState } from "@/lib/end-of-lesson-scheduling/service";
import type {
  InstructorRisLessonCard,
  PlanningCard,
  RisScriptAssessment,
} from "@/lib/ris/data";

type TabKey =
  | "quick"
  | "info"
  | "planning"
  | "scoring"
  | "reflection"
  | "summary";

export type EvaluationLessonInfo = {
  studentName: string;
  studentEmail: string | null;
  studentPhone: string | null;
  statusLabel: string;
  dateLabel: string;
  timeLabel: string;
  durationLabel: string;
  location: string;
  pickupAreaName: string | null;
  vehicleLabel: string;
  progressPct: number;
  progressSummary: string | null;
  cbrItems: Array<{ label: string; ok: boolean; value: string }>;
  attentionItems: string[];
  radarItems: string[];
  moduleProgress: Array<{ moduleNumber: number; progressPct: number }>;
};

const TABS: Array<{
  key: TabKey;
  label: string;
  icon: typeof FileText;
}> = [
  { key: "quick", label: "Snel afronden", icon: CheckCircle2 },
  { key: "info", label: "Lesinfo", icon: FileText },
  { key: "planning", label: "Plankaart", icon: Target },
  { key: "scoring", label: "Beoordeling", icon: BookOpenCheck },
  { key: "reflection", label: "Reflectie", icon: MessageSquareText },
  { key: "summary", label: "Samenvatting / Afronding", icon: ClipboardList },
];

const OPEN_RIS_CARD_STATUSES = new Set([
  "draft",
  "completion_in_progress",
  "ready_to_publish",
]);

export function RisEvaluationTabs({
  lessonId,
  studentId,
  studentName,
  ris,
  planningCard,
  goalOptions,
  lessonInfo,
  studentLearningWish,
  endOfLessonScheduling,
}: {
  lessonId: string;
  studentId: string;
  studentName: string;
  ris: InstructorRisLessonCard;
  planningCard: PlanningCard | null;
  goalOptions: string[];
  lessonInfo: EvaluationLessonInfo;
  studentLearningWish: string | null;
  endOfLessonScheduling: EndOfLessonSchedulingState;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("quick");
  const [risState, setRisState] = useState(ris);

  useEffect(() => {
    setRisState(ris);
  }, [ris]);

  function updateAssessments(assessments: RisScriptAssessment[]) {
    setRisState((current) => ({ ...current, assessments }));
  }

  function moveTabFocus(
    current: TabKey,
    key: "ArrowLeft" | "ArrowRight" | "Home" | "End",
  ) {
    const currentIndex = TABS.findIndex((tab) => tab.key === current);
    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? TABS.length - 1
          : (currentIndex + (key === "ArrowRight" ? 1 : -1) + TABS.length) %
            TABS.length;
    const next = TABS[nextIndex]?.key;
    if (!next) return;
    setActiveTab(next);
    requestAnimationFrame(() => {
      document.getElementById(`lesson-tab-${next}`)?.focus();
    });
  }

  const lessonCardLocked = Boolean(
    risState.card && !OPEN_RIS_CARD_STATUSES.has(risState.card.publicationStatus),
  );

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-border bg-card/85 p-1 shadow-brand-card">
        <div
          className="flex min-w-max gap-1"
          role="tablist"
          aria-label="Onderdelen van de Lesson Cockpit"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                id={`lesson-tab-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                aria-controls={`lesson-panel-${tab.key}`}
                tabIndex={activeTab === tab.key ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(event) => {
                  if (
                    event.key === "ArrowLeft" ||
                    event.key === "ArrowRight" ||
                    event.key === "Home" ||
                    event.key === "End"
                  ) {
                    event.preventDefault();
                    moveTabFocus(tab.key, event.key);
                  }
                }}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-black transition",
                  activeTab === tab.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "quick" ? (
        <div
          id="lesson-panel-quick"
          role="tabpanel"
          aria-labelledby="lesson-tab-quick"
          className="space-y-4"
        >
          <Card className="border-primary/25 bg-primary-soft/20">
            <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  Lesson Cockpit
                </div>
                <h2 className="mt-1 text-xl font-black text-foreground">
                  Beoordelen, reflecteren en afronden
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Werk de focusscripts bij, leg de reflectie vast en controleer
                  de volgende les. Concepten worden tussentijds opgeslagen.
                </p>
              </div>
              <Badge variant="primary">Doel: binnen 60 seconden</Badge>
            </CardContent>
          </Card>
          <RisScriptScoring
            lessonId={lessonId}
            studentName={studentName}
            ris={risState}
            onAssessmentsChange={updateAssessments}
            compact
          />
          <RisLessonPublicationPanel
            lessonId={lessonId}
            studentId={studentId}
            studentName={studentName}
            ris={risState}
            mode="quick"
          />
          <EndOfLessonSchedulingPanel state={endOfLessonScheduling} />
        </div>
      ) : null}
      {activeTab === "info" ? (
        <div id="lesson-panel-info" role="tabpanel" aria-labelledby="lesson-tab-info">
          <LessonInfoTab info={lessonInfo} />
        </div>
      ) : null}
      {activeTab === "planning" ? (
        <div id="lesson-panel-planning" role="tabpanel" aria-labelledby="lesson-tab-planning">
          <InstructorPlanningCardPanel
            lessonId={lessonId}
            studentId={studentId}
            studentName={studentName}
            planningCard={planningCard}
            goalOptions={goalOptions}
            studentLearningWish={studentLearningWish}
            lessonCardLocked={lessonCardLocked}
          />
        </div>
      ) : null}
      {activeTab === "scoring" ? (
        <div id="lesson-panel-scoring" role="tabpanel" aria-labelledby="lesson-tab-scoring">
          <RisScriptScoring
            lessonId={lessonId}
            studentName={studentName}
            ris={risState}
            onAssessmentsChange={updateAssessments}
          />
        </div>
      ) : null}
      {activeTab === "reflection" ? (
        <div id="lesson-panel-reflection" role="tabpanel" aria-labelledby="lesson-tab-reflection">
          <RisLessonPublicationPanel
            lessonId={lessonId}
            studentId={studentId}
            studentName={studentName}
            ris={risState}
            mode="reflection"
          />
        </div>
      ) : null}
      {activeTab === "summary" ? (
        <div
          id="lesson-panel-summary"
          role="tabpanel"
          aria-labelledby="lesson-tab-summary"
          className="space-y-4"
        >
          <RisLessonPublicationPanel
            lessonId={lessonId}
            studentId={studentId}
            studentName={studentName}
            ris={risState}
            mode="summary"
          />
          <EndOfLessonSchedulingPanel state={endOfLessonScheduling} />
        </div>
      ) : null}
    </div>
  );
}

function LessonInfoTab({ info }: { info: EvaluationLessonInfo }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Card className="overflow-hidden">
        <CardContent className="space-y-5 pt-5">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase text-primary">
              <FileText className="h-4 w-4" aria-hidden />
              Lesinfo
            </div>
            <h2 className="mt-1 text-xl font-black text-foreground">
              Alles wat vooraf bekend is
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Praktische lescontext, voortgang, CBR-status en aandachtspunten voor
              deze evaluatie.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <InfoTile icon={UserRound} label="Leerling" value={info.studentName} />
            <InfoTile icon={CalendarDays} label="Moment" value={info.dateLabel} detail={info.timeLabel} />
            <InfoTile icon={Flag} label="Status" value={info.statusLabel} detail={info.durationLabel} />
            <InfoTile icon={MapPin} label="Ophaallocatie" value={info.location} detail={info.pickupAreaName ?? undefined} />
            <InfoTile icon={Car} label="Voertuig" value={info.vehicleLabel} />
            <InfoTile
              icon={CheckCircle2}
              label="RIS voortgang"
              value={`${info.progressPct}%`}
              detail={info.progressSummary ?? "Actuele voortgang op basis van gepubliceerde RIS-scores."}
            />
          </div>

          <section className="rounded-2xl border border-border bg-card/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-black text-foreground">Modulevoortgang</h3>
              <Badge variant="primary">{info.progressPct}% totaal</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {info.moduleProgress.map((module) => (
                <div key={module.moduleNumber}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-bold text-foreground">Module {module.moduleNumber}</span>
                    <span className="text-muted-foreground">{module.progressPct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(0, Math.min(100, module.progressPct))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <ContextBlock
              title="Aandachtspunten"
              empty="Geen aandachtspunten vooraf bekend."
              items={info.attentionItems}
            />
            <ContextBlock
              title="Radar"
              empty="Geen radarpunten vanuit eerdere lessen."
              items={info.radarItems}
            />
          </section>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h3 className="font-black text-foreground">CBR-status</h3>
            {info.cbrItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2"
              >
                <div>
                  <div className="text-sm font-bold text-foreground">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.value}</div>
                </div>
                <Badge variant={item.ok ? "success" : "warning"}>
                  {item.ok ? "Op orde" : "Aandacht"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-5">
            <h3 className="font-black text-foreground">Contact</h3>
            <InfoLine label="E-mail" value={info.studentEmail ?? "Niet vastgelegd"} />
            <InfoLine label="Telefoon" value={info.studentPhone ?? "Niet vastgelegd"} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        {label}
      </div>
      <div className="mt-2 text-base font-black text-foreground">{value}</div>
      {detail ? <div className="mt-1 text-sm text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function ContextBlock({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: string[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <div className="mb-3 flex items-center gap-2 font-black text-foreground">
        <AlertTriangle className="h-4 w-4 text-primary" aria-hidden />
        {title}
      </div>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item} className="rounded-xl bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
          {empty}
        </p>
      )}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <span className="truncate font-bold text-foreground">{value}</span>
    </div>
  );
}
