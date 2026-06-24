import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Circle,
  FileCheck2,
  MessageSquareText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  FinanceOnboardingFacts,
  FinanceOnboardingPlan,
  FinanceOnboardingStepStatus,
} from "@/lib/finance/onboarding";

export function FinanceOnboardingPanel({
  facts,
  plan,
}: {
  facts: FinanceOnboardingFacts;
  plan: FinanceOnboardingPlan;
}) {
  return (
    <Card>
      <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Finance onboarding script</CardTitle>
            <Badge variant={statusVariant(plan.status)}>
              {plan.statusLabel}
            </Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Klantgericht script voor {facts.tenantName}: van factuurbasis en
            pakketten tot betaalprovider, herinneringen, tegoedvrijgave,
            boekhoudcontrole en go-live proefrun.
          </p>
        </div>
        <div className="min-w-[12rem] rounded-xl border border-border bg-muted/25 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Inrichting
          </p>
          <p className="mt-1 text-3xl font-black text-foreground">
            {plan.completionPct}%
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${plan.completionPct}%` }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="grid gap-3 xl:grid-cols-7">
          {plan.steps.map((step) => (
            <div
              key={step.id}
              className="rounded-xl border border-border bg-background px-3 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className={statusIconClass(step.status)}>
                  <StatusIcon status={step.status} />
                </span>
                <Badge variant={statusVariant(step.status)}>
                  {statusLabel(step.status)}
                </Badge>
              </div>
              <p className="mt-3 text-sm font-black text-foreground">
                {step.title}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Eigenaar: {step.owner}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {step.verification}
              </p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)]">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-primary" aria-hidden />
              <h3 className="font-black text-foreground">Gespreksscript</h3>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {plan.conversationScript.map((section) => (
                <div
                  key={section.title}
                  className="rounded-xl border border-border bg-background p-4"
                >
                  <p className="text-sm font-black text-foreground">
                    {section.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {section.body}
                  </p>
                  <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-primary" aria-hidden />
                <h3 className="font-black text-foreground">Go-live checklist</h3>
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                {plan.goLiveChecklist.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" aria-hidden />
                <h3 className="font-black text-foreground">Live feiten</h3>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Fact label="Pakketten" value={facts.packageCount} />
                <Fact label="Facturen" value={facts.invoiceCounts.total} />
                <Fact label="Open" value={facts.invoiceCounts.open} />
                <Fact label="Verlopen" value={facts.invoiceCounts.overdue} />
                <Fact label="Betaalrecords" value={facts.paymentRecordCount} />
                <Fact label="BTW-tarieven" value={facts.vatRateCount} />
              </dl>
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          {plan.steps.map((step) => (
            <div
              key={`${step.id}-script`}
              className="rounded-xl border border-border bg-background p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-black text-foreground">{step.title}</p>
                <Badge variant={statusVariant(step.status)}>
                  {statusLabel(step.status)}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {step.goal}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <ScriptBlock label="Vraag aan klant" value={step.customerQuestion} />
                <ScriptBlock label="Inrichten" value={step.setupAction} />
              </div>
            </div>
          ))}
        </section>

        {plan.riskNotes.length > 0 ? (
          <section className="rounded-xl border border-warning/30 bg-warning/10 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
              <h3 className="font-black text-foreground">Aandacht voor go-live</h3>
            </div>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground md:grid-cols-2">
              {plan.riskNotes.map((note) => (
                <li key={note} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-black tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function ScriptBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}

function StatusIcon({ status }: { status: FinanceOnboardingStepStatus }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4" aria-hidden />;
  if (status === "attention") return <AlertTriangle className="h-4 w-4" aria-hidden />;
  return <Circle className="h-4 w-4" aria-hidden />;
}

function statusLabel(status: FinanceOnboardingStepStatus): string {
  if (status === "done") return "Klaar";
  if (status === "attention") return "Aandacht";
  return "Open";
}

function statusVariant(
  status: FinanceOnboardingStepStatus,
): "success" | "warning" | "outline" {
  if (status === "done") return "success";
  if (status === "attention") return "warning";
  return "outline";
}

function statusIconClass(status: FinanceOnboardingStepStatus): string {
  const base =
    "inline-flex h-8 w-8 items-center justify-center rounded-xl border";
  if (status === "done") return `${base} border-success/25 bg-success/10 text-success`;
  if (status === "attention") return `${base} border-warning/25 bg-warning/10 text-warning`;
  return `${base} border-border bg-muted text-muted-foreground`;
}
