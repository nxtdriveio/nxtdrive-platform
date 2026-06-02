import Link from "next/link";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadTenantCbrOverview } from "@/lib/cbr/data";
import {
  CBR_EXAM_STATUS_LABEL,
  CBR_EXAM_STATUS_TONE,
  type CbrStatusTone,
} from "@/lib/cbr/derive";
import { MACHTIGING_STATUS_LABEL } from "@/lib/cbr/types";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const TONE_VARIANT: Record<
  CbrStatusTone,
  "default" | "info" | "warning" | "success" | "danger"
> = {
  neutral: "default",
  info: "info",
  warning: "warning",
  success: "success",
  danger: "danger",
};

export default async function CbrOverviewPage() {
  const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);
  const supabase = await createServerSupabaseClient();
  const rows = await loadTenantCbrOverview(supabase, tenant.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          CBR-status
        </h1>
        <p className="text-sm text-muted-foreground">
          Examenproces per leerling van {tenant.name} — machtiging, theorie,
          gezondheidsverklaring en de afgeleide examenstatus.
        </p>
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nog geen actieve leerlingen.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="px-4 py-3 font-medium">Examenstatus</th>
                <th className="px-4 py-3 font-medium">Machtiging</th>
                <th className="px-4 py-3 font-medium">Theorie</th>
                <th className="px-4 py-3 font-medium">Gezondheidsverkl.</th>
                <th className="px-4 py-3 font-medium">Laatste uitslag</th>
                <th className="px-4 py-3 font-medium">Eerstvolgende</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const gv = row.preconditions.gezondheidsverklaringVereist
                  ? row.preconditions.gezondheidsverklaringGeregeld
                    ? "Geregeld"
                    : "Open"
                  : "N.v.t.";
                return (
                  <tr key={row.studentId} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/backoffice/leerlingen/${row.studentId}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {row.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          TONE_VARIANT[
                            CBR_EXAM_STATUS_TONE[row.derived.examStatus]
                          ]
                        }
                      >
                        {CBR_EXAM_STATUS_LABEL[row.derived.examStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          row.preconditions.machtigingStatus === "ontvangen"
                            ? "success"
                            : row.preconditions.machtigingStatus ===
                                "aangevraagd"
                              ? "warning"
                              : "default"
                        }
                      >
                        {
                          MACHTIGING_STATUS_LABEL[
                            row.preconditions.machtigingStatus
                          ]
                        }
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.preconditions.theorieBehaald ? "Behaald" : "Open"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{gv}</td>
                    <td className="px-4 py-3">
                      {row.derived.lastExamResult ? (
                        <Badge
                          variant={
                            row.derived.lastExamResult === "passed"
                              ? "success"
                              : "danger"
                          }
                        >
                          {row.derived.lastExamResult === "passed"
                            ? "Geslaagd"
                            : "Gezakt"}
                          {row.derived.lastExamAt
                            ? ` · ${dateFmt.format(new Date(row.derived.lastExamAt))}`
                            : ""}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {row.derived.nextAppointmentAt
                        ? dateFmt.format(
                            new Date(row.derived.nextAppointmentAt),
                          )
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
