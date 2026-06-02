import { AlertTriangle, Info, CircleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExamSignalButtons } from "./exam-signal-buttons";
import type { ExamSignal } from "@/lib/exam/signals";

const SEVERITY_STYLE: Record<
  ExamSignal["severity"],
  { row: string; icon: typeof Info }
> = {
  info: { row: "border-border bg-muted/40 text-foreground", icon: Info },
  warning: {
    row: "border-warning/40 bg-warning/5 text-foreground",
    icon: AlertTriangle,
  },
  critical: {
    row: "border-danger/40 bg-danger/5 text-foreground",
    icon: CircleAlert,
  },
};

export function ExamSignalsPanel({
  appointmentId,
  signals,
}: {
  appointmentId: string;
  signals: ExamSignal[];
}) {
  if (signals.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schoolsignalen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Aandachtspunten rond dit examenmoment, automatisch afgeleid uit het
          dossier. Zet ze met één klik om naar een taak.
        </p>
        <ul className="space-y-2">
          {signals.map((signal) => {
            const style = SEVERITY_STYLE[signal.severity];
            const Icon = style.icon;
            return (
              <li
                key={signal.code}
                className={`flex gap-3 rounded-md border p-3 text-sm ${style.row}`}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="space-y-0.5">
                  <p className="font-medium">{signal.title}</p>
                  <p className="text-muted-foreground">{signal.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <ExamSignalButtons
          appointmentId={appointmentId}
          signals={signals.map((s) => ({ code: s.code, label: s.title }))}
        />
      </CardContent>
    </Card>
  );
}
