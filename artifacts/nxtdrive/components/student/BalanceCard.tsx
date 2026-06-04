import { Wallet } from "lucide-react";
import { PWACard, PWASectionHeader } from "@/components/pwa/primitives";
import { formatHours } from "@/lib/students/types";

export function StudentBalanceCard({ balance }: { balance: number }) {
  const tone =
    balance > 300
      ? "text-success"
      : balance > 0
        ? "text-warning"
        : "text-danger";
  const hint =
    balance > 300
      ? "Je hebt voldoende tegoed voor je volgende lessen."
      : balance > 0
        ? "Je tegoed wordt krap. Neem contact op met je rijschool voor een nieuw pakket."
        : "Je hebt geen tegoed meer. Neem contact op met je rijschool om verder te plannen.";
  return (
    <PWACard>
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Wallet className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <PWASectionHeader className="mb-1">Tegoed</PWASectionHeader>
          <div className={`text-2xl font-bold tabular-nums ${tone}`}>
            {formatHours(balance)}{" "}
            <span className="text-sm font-medium">uur</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
        </div>
      </div>
    </PWACard>
  );
}
