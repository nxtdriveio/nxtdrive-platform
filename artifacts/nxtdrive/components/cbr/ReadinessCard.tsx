import { ClipboardCheck, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CbrChecklistItem } from "@/lib/cbr/types";
import { readinessPct } from "@/lib/cbr/types";
import { cn } from "@/lib/utils";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function CbrReadinessCard({ items }: { items: CbrChecklistItem[] }) {
  const pct = readinessPct(items);
  const done = items.filter((i) => i.achieved).length;

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <ClipboardCheck className="h-4 w-4" aria-hidden />
            Examenklaar (CBR)
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {done} / {items.length}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-semibold text-foreground tabular-nums">
              {pct}%
            </span>
            <span className="text-xs text-muted-foreground">
              {pct >= 100
                ? "Helemaal klaar voor het examen"
                : pct >= 75
                  ? "Bijna examenklaar"
                  : pct >= 40
                    ? "Goed op weg"
                    : "Net begonnen"}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Je rijschool heeft nog geen onderdelen ingesteld.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {items.map((item) => (
              <li
                key={item.competency.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm",
                  item.achieved
                    ? "border-primary/40 bg-primary-soft/40 text-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border",
                      item.achieved
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card",
                    )}
                    aria-hidden
                  >
                    {item.achieved ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span
                    className={cn(
                      item.achieved ? "font-medium text-foreground" : "",
                    )}
                  >
                    {item.competency.label}
                  </span>
                </span>
                {item.achieved && item.achieved_at ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {dateFmt.format(new Date(item.achieved_at))}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
