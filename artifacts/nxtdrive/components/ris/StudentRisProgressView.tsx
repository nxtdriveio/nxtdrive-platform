import Link from "next/link";
import {
  BookOpenCheck,
  CheckCircle2,
  Compass,
  Lightbulb,
  MessageSquareText,
  Route,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PWAEmptyState, PWASectionHeader } from "@/components/pwa/primitives";
import {
  StudentInitialBadge,
  StudentListRow,
  StudentProgressBar,
  StudentRing,
  StudentShowcaseCard,
  StudentShowcaseEmptyState,
  StudentShowcaseTabs,
} from "@/components/student/Showcase";
import { createNlDateTimeFormatter } from "@/lib/datetime";
import type {
  StudentRisProgress,
  StudentRisProgressItem,
  StudentRisPublishedCard,
} from "@/lib/ris/data";

type RisStudentTab = "roadmap" | "modules" | "feedback";

const dateFmt = createNlDateTimeFormatter({
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFmt = createNlDateTimeFormatter({
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function StudentRisProgressView({
  ris,
  activeTab,
}: {
  ris: StudentRisProgress;
  activeTab: RisStudentTab;
}) {
  const recentCards = ris.publishedCards.slice(0, 6);
  const latestCard = recentCards[0] ?? null;
  const focusItems = ris.progress
    .filter((item) => item.isAttentionPoint || !item.isCompleted)
    .sort((left, right) => {
      const leftStep = stepRank(left.currentFinalStep);
      const rightStep = stepRank(right.currentFinalStep);
      return Number(right.isAttentionPoint) - Number(left.isAttentionPoint) || leftStep - rightStep;
    })
    .slice(0, 5);
  const practicedItems = ris.progress
    .filter((item) => item.lastAssessedAt)
    .sort((left, right) => (right.lastAssessedAt ?? "").localeCompare(left.lastAssessedAt ?? ""))
    .slice(0, 6);

  const tabs = [
    { key: "roadmap", label: "Roadmap", href: "/student/voortgang?tab=roadmap" },
    {
      key: "modules",
      label: "Modules",
      href: "/student/voortgang?tab=modules",
      count: ris.moduleProgress.length,
    },
    {
      key: "feedback",
      label: "Feedback",
      href: "/student/voortgang?tab=feedback",
      count: recentCards.length,
    },
  ] satisfies Array<{
    key: RisStudentTab;
    label: string;
    href: string;
    count?: number;
  }>;

  return (
    <>
      <StudentShowcaseTabs items={tabs} activeKey={activeTab} />

      {activeTab === "roadmap" ? (
        <div className="space-y-4">
          <StudentShowcaseCard
            title="Mijn RIS-rijbewijsreis"
            eyebrow="Roadmap"
            info="Je ziet hier alleen gepubliceerde voortgang. Conceptscores van je instructeur blijven intern totdat de leskaart gepubliceerd is."
          >
            <div className="space-y-4 sm:grid sm:grid-cols-[7.8rem_minmax(0,1fr)] sm:gap-4 sm:space-y-0">
              <div className="flex items-center gap-3 sm:block">
                <StudentRing
                  value={ris.progressPct}
                  caption={`${ris.progress.filter((item) => item.currentFinalStep).length} scripts geoefend`}
                />
                <div>
                  <div className="text-lg font-semibold text-white">
                    {journeyLabel(ris.progressPct)}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-white/58">
                    RIS 2.0 bouwt stap voor stap richting zelfstandig rijden.
                  </p>
                </div>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {ris.moduleProgress.map((module) => (
                  <ModuleSummaryCard key={module.moduleNumber} module={module} />
                ))}
              </div>
            </div>
          </StudentShowcaseCard>

          <StudentShowcaseCard
            title="Volgende focus"
            eyebrow="Waar groei oplevert"
            info="Deze punten komen uit gepubliceerde RIS-scores en aandachtspunten. Je ziet dus alleen wat je instructeur heeft bevestigd."
          >
            {focusItems.length === 0 ? (
              <StudentShowcaseEmptyState
                title="Geen extra aandachtspunten"
                description="Je gepubliceerde RIS-voortgang staat stabiel. Na je volgende les verschijnen nieuwe focuspunten vanzelf."
                icon={<Sparkles className="h-5 w-5" aria-hidden />}
              />
            ) : (
              <div className="space-y-2.5">
                {focusItems.map((item) => (
                  <StudentListRow
                    key={`${item.scriptId}:${item.scriptVariantId ?? "base"}`}
                    title={scriptTitle(ris, item)}
                    subtitle={studentStepLabel(item)}
                    badge={item.isAttentionPoint ? "Focus" : "Oefenen"}
                    badgeVariant={item.isAttentionPoint ? "warning" : "primary"}
                    leading={
                      <StudentInitialBadge
                        label={stepBadgeLabel(item.currentFinalStep)}
                        tone={item.isAttentionPoint ? "orange" : "default"}
                      />
                    }
                  />
                ))}
              </div>
            )}
          </StudentShowcaseCard>

          <StudentShowcaseCard
            title="Laatst geoefend"
            eyebrow="Recente RIS-scripts"
            info="Deze lijst gebruikt alleen gepubliceerde beoordelingen, zodat jij ziet wat echt met je gedeeld is."
          >
            {practicedItems.length === 0 ? (
              <StudentShowcaseEmptyState
                title="Nog geen geoefende scripts"
                description="Na publicatie van je eerste RIS-leskaart zie je hier welke onderdelen je recent hebt geoefend."
                icon={<BookOpenCheck className="h-5 w-5" aria-hidden />}
              />
            ) : (
              <div className="space-y-2.5">
                {practicedItems.map((item) => (
                  <StudentListRow
                    key={`${item.scriptId}:${item.scriptVariantId ?? "base"}:${item.lastAssessedAt}`}
                    href={
                      item.lastAssessedLessonId
                        ? `/student/lessons/${item.lastAssessedLessonId}`
                        : undefined
                    }
                    title={scriptTitle(ris, item)}
                    subtitle={studentStepLabel(item)}
                    meta={
                      item.lastAssessedAt
                        ? dateTimeFmt.format(new Date(item.lastAssessedAt))
                        : undefined
                    }
                    badge={item.readyForModuleTest ? "Toetsklaar" : "Gepubliceerd"}
                    badgeVariant={item.readyForModuleTest ? "success" : "outline"}
                    leading={
                      <StudentInitialBadge label={stepBadgeLabel(item.currentFinalStep)} />
                    }
                  />
                ))}
              </div>
            )}
          </StudentShowcaseCard>

          <LatestFeedbackCard card={latestCard} />
        </div>
      ) : null}

      {activeTab === "modules" ? (
        <StudentShowcaseCard
          title="RIS-modules"
          eyebrow="Moduleprogressie"
          info="RIS gebruikt vier modules. Per module zie je hoeveel scripts al beoordeeld zijn en hoe ver je richting zelfstandig rijden bent."
        >
          <div className="space-y-3">
            {ris.moduleProgress.map((module) => (
              <div
                key={module.moduleNumber}
                className="rounded-[1.15rem] border border-white/10 bg-white/[0.025] px-3.5 py-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      Module {module.moduleNumber}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-white/50">
                      {module.assessedScripts} van {module.totalScripts} scripts beoordeeld
                    </p>
                  </div>
                  <Badge
                    variant={module.readyForModuleTest ? "success" : "outline"}
                    className="shrink-0"
                  >
                    {module.readyForModuleTest ? "Toetsklaar" : "In opbouw"}
                  </Badge>
                </div>
                <div className="mt-3">
                  <StudentProgressBar
                    label={
                      module.averageStep == null
                        ? "Nog geen gepubliceerde score"
                        : `Gemiddelde score ${module.averageStep.toFixed(1)} van 10`
                    }
                    value={module.progressPct}
                    rightLabel={`${module.progressPct}%`}
                  />
                </div>
                {module.attentionPoints > 0 ? (
                  <div className="mt-3 rounded-[0.95rem] border border-amber-400/16 bg-amber-400/[0.07] px-3 py-2 text-xs leading-5 text-amber-100/82">
                    {module.attentionPoints} aandachtspunt{module.attentionPoints === 1 ? "" : "en"} in deze module.
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </StudentShowcaseCard>
      ) : null}

      {activeTab === "feedback" ? (
        <StudentShowcaseCard
          title="Lesfeedback"
          eyebrow="Gepubliceerde leskaarten"
          info="Hier lees je de feedback die je instructeur met jou heeft gedeeld, inclusief reflectie en volgende focus."
        >
          {recentCards.length === 0 ? (
            <PWAEmptyState message="Zodra je instructeur een RIS-leskaart publiceert, verschijnt je feedback hier." />
          ) : (
            <div className="space-y-3">
              {recentCards.map((card) => (
                <PublishedLessonCard key={card.id} card={card} />
              ))}
            </div>
          )}
        </StudentShowcaseCard>
      ) : null}

      <section className="px-1 pt-1">
        <PWASectionHeader icon={<Compass className="h-3.5 w-3.5" aria-hidden />}>
          Volgende slimme stap
        </PWASectionHeader>
        <Link
          href="/student/lessons"
          className="flex items-center justify-between rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/72 transition hover:border-white/16 hover:text-white"
        >
          <span className="inline-flex items-center gap-2">
            <Route className="h-4 w-4 text-primary" aria-hidden />
            Open je planning en houd je ritme vast
          </span>
          <Sparkles className="h-4 w-4 text-primary/72" aria-hidden />
        </Link>
      </section>
    </>
  );
}

function ModuleSummaryCard({
  module,
}: {
  module: StudentRisProgress["moduleProgress"][number];
}) {
  return (
    <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.035] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase text-white/42">
            Module {module.moduleNumber}
          </div>
          <div className="mt-1 text-lg font-black leading-none text-white">{module.progressPct}%</div>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/16 text-primary">
          {module.readyForModuleTest ? (
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          ) : (
            <BookOpenCheck className="h-5 w-5" aria-hidden />
          )}
        </span>
      </div>
      <div className="mt-3">
        <StudentProgressBar
          label={`${module.assessedScripts}/${module.totalScripts} scripts`}
          value={module.progressPct}
        />
      </div>
    </div>
  );
}

function LatestFeedbackCard({ card }: { card: StudentRisPublishedCard | null }) {
  if (!card) {
    return (
      <StudentShowcaseCard
        title="Instructeurfeedback"
        eyebrow="Laatste leskaart"
        info="Je instructeur publiceert alleen feedback die klaar is om met jou te delen."
      >
        <StudentShowcaseEmptyState
          title="Nog geen gepubliceerde RIS-feedback"
          description="Na je eerste gepubliceerde RIS-leskaart zie je hier de samenvatting, reflectie en volgende focus."
          icon={<MessageSquareText className="h-5 w-5" aria-hidden />}
        />
      </StudentShowcaseCard>
    );
  }

  return (
    <StudentShowcaseCard
      title="Instructeurfeedback"
      eyebrow="Laatste leskaart"
      info="Deze tekst is leerlingvriendelijk bevestigd door je instructeur."
      actionLabel="Open les"
      actionHref={`/student/lessons/${card.lessonId}`}
    >
      <PublishedLessonCard card={card} featured />
    </StudentShowcaseCard>
  );
}

function PublishedLessonCard({
  card,
  featured = false,
}: {
  card: StudentRisPublishedCard;
  featured?: boolean;
}) {
  const reflection = card.reflection;
  return (
    <article
      className={
        featured
          ? "rounded-[1.2rem] border border-primary/18 bg-primary/[0.07] px-3.5 py-3.5"
          : "rounded-[1.1rem] border border-white/10 bg-white/[0.025] px-3.5 py-3.5"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">
            {card.publishedAt
              ? dateFmt.format(new Date(card.publishedAt))
              : "Gepubliceerde leskaart"}
          </div>
          <p className="mt-1 text-xs leading-5 text-white/46">
            Alleen de met jou gedeelde RIS-feedback.
          </p>
        </div>
        <Badge variant="success" className="shrink-0">
          Gepubliceerd
        </Badge>
      </div>

      {card.studentFriendlySummary ? (
        <p className="mt-3 text-sm leading-6 text-white/70">{card.studentFriendlySummary}</p>
      ) : null}

      {card.homeworkOrNextFocus ? (
        <div className="mt-3 rounded-[1rem] border border-primary/18 bg-primary/[0.08] px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div>
              <div className="text-xs font-semibold uppercase text-primary/72">
                Huiswerk / volgende focus
              </div>
              <p className="mt-1 text-sm leading-6 text-white/70">{card.homeworkOrNextFocus}</p>
            </div>
          </div>
        </div>
      ) : null}

      {reflection ? (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
          <ReflectionSnippet label="Dit ging goed" value={reflection.wentWellText} />
          <ReflectionSnippet label="Dit was lastig" value={reflection.difficultText} />
          <ReflectionSnippet label="Jouw leerwens" value={reflection.nextLessonWish} />
        </div>
      ) : null}
    </article>
  );
}

function ReflectionSnippet({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div className="rounded-[0.95rem] border border-white/10 bg-black/10 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase text-white/36">
        {label}
      </div>
      <p className="mt-1 text-xs leading-5 text-white/62">{value}</p>
    </div>
  );
}

function scriptTitle(ris: StudentRisProgress, item: StudentRisProgressItem): string {
  for (const module of ris.catalog.tree) {
    for (const category of module.categories) {
      const script = category.scripts.find((candidate) => candidate.id === item.scriptId);
      if (script) return script.title;
    }
  }
  return "RIS-onderdeel";
}

function studentStepLabel(item: StudentRisProgressItem): string {
  if (!item.currentFinalStep) return item.studentLabel;
  return `Score ${item.currentFinalStep}/10 - ${item.studentLabel.toLowerCase()}`;
}

function stepBadgeLabel(step: StudentRisProgressItem["currentFinalStep"]): string {
  return step ? `${step}/10` : "-";
}

function stepRank(step: StudentRisProgressItem["currentFinalStep"]): number {
  if (!step) return 0;
  return Number(step);
}

function journeyLabel(progressPct: number): string {
  if (progressPct >= 85) return "Bijna examenrijp";
  if (progressPct >= 60) return "Je rijdt steeds zelfstandiger";
  if (progressPct >= 30) return "Je bouwt stevig door";
  return "Je RIS-reis is goed gestart";
}
