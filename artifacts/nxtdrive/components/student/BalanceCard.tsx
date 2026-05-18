import { Card, CardContent } from "@/components/ui/card";
import { Wallet } from "lucide-react";

export function StudentBalanceCard({ balance }: { balance: number }) {
  const tone =
    balance > 5
      ? "text-success"
      : balance > 0
        ? "text-warning"
        : "text-danger";
  const hint =
    balance > 5
      ? "Je hebt voldoende credits voor je volgende lessen."
      : balance > 0
        ? "Je tegoed wordt krap. Neem contact op met je rijschool voor een nieuw pakket."
        : "Je hebt geen credits meer. Neem contact op met je rijschool om verder te plannen.";
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Wallet className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Tegoed
          </div>
          <div className={`text-2xl font-bold tabular-nums ${tone}`}>
            {balance} <span className="text-sm font-medium">credits</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
        </div>
      </CardContent>
    </Card>
  );
}
