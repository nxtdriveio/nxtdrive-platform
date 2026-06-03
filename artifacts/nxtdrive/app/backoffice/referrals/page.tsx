import { Gift, Users } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadReferralOverview } from "@/lib/referrals/data";
import {
  LEAD_STATUS_LABEL,
  LEAD_STATUS_VARIANT,
  type LeadStatus,
} from "@/lib/leads/types";
import { RewardToggle } from "./reward-toggle";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export default async function ReferralsPage() {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const service = createServiceRoleClient();
  const groups = await loadReferralOverview(service, tenant.id);

  const totalReferred = groups.reduce(
    (sum, g) => sum + g.referredLeads.length,
    0,
  );
  const totalPending = groups.reduce(
    (sum, g) => sum + g.pendingRewardCount,
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Referrals
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aanmeldingen die via een leerling zijn doorverwezen. Beloningen handel
          je hier handmatig af.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-1 pt-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden />
              Doorverwijzers
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {groups.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Gift className="h-4 w-4" aria-hidden />
              Doorverwezen leads
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {totalReferred}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Gift className="h-4 w-4" aria-hidden />
              Beloning openstaand
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {totalPending}
            </p>
          </CardContent>
        </Card>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Er zijn nog geen doorverwezen aanmeldingen. Leerlingen vinden hun
              persoonlijke uitnodigingslink in de app onder &quot;Nodig een
              vriend uit&quot;.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.studentId}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{group.studentName ?? "Onbekende leerling"}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {group.referredLeads.length}{" "}
                    {group.referredLeads.length === 1
                      ? "doorverwijzing"
                      : "doorverwijzingen"}
                    {group.code ? ` · code ${group.code}` : ""}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.referredLeads.map((lead) => {
                  const status = lead.status as LeadStatus;
                  const converted =
                    status === "converted" || status === "trial_completed";
                  return (
                    <div
                      key={lead.leadId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {lead.fullName ?? "Naamloos"}
                          </span>
                          <Badge variant={LEAD_STATUS_VARIANT[status]}>
                            {LEAD_STATUS_LABEL[status] ?? status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {lead.email ?? "geen e-mail"} · aangemeld{" "}
                          {formatDate(lead.createdAt)}
                        </p>
                      </div>
                      {converted ? (
                        <RewardToggle
                          leadId={lead.leadId}
                          handled={lead.rewardHandledAt !== null}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Nog niet geconverteerd
                        </span>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
