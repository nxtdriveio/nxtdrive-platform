import type { RoleGovernanceAlert } from "@/lib/organization/roles";
import { cn } from "@/lib/utils";

function toneClasses(alert: RoleGovernanceAlert): string {
  return alert.tone === "warning"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
    : "border-border bg-muted/30 text-muted-foreground";
}

export function GovernanceAlerts({
  alerts,
  className,
}: {
  alerts: readonly RoleGovernanceAlert[];
  className?: string;
}) {
  if (alerts.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {alerts.map((alert) => (
        <div
          key={`${alert.tone}-${alert.title}`}
          className={cn("rounded-xl border px-4 py-3 text-sm", toneClasses(alert))}
        >
          <p className="font-medium text-foreground">{alert.title}</p>
          <p className="mt-1">{alert.description}</p>
        </div>
      ))}
    </div>
  );
}
