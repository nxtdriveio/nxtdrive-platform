import Link from "next/link";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_VARIANT,
  LEAD_SOURCE_LABEL,
  type Lead,
  type LeadStatus,
} from "@/lib/leads/types";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);
  const { status } = await searchParams;

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("leads")
    .select(
      "id, status, source, full_name, email, phone, postcode, created_at, updated_at",
    )
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status && (LEAD_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status as LeadStatus);
  }

  const { data: leadsRaw } = await query;
  const leads = (leadsRaw ?? []) as Array<
    Pick<
      Lead,
      | "id"
      | "status"
      | "source"
      | "full_name"
      | "email"
      | "phone"
      | "postcode"
      | "created_at"
      | "updated_at"
    >
  >;

  // Counts per status for filter chips
  const { data: countsRaw } = await supabase
    .from("leads")
    .select("status")
    .eq("tenant_id", tenant.id);
  const counts: Record<LeadStatus, number> = {
    new: 0,
    contacted: 0,
    package_advised: 0,
    converted: 0,
    dropped: 0,
  };
  for (const row of (countsRaw ?? []) as Array<{ status: LeadStatus }>) {
    counts[row.status] += 1;
  }
  const total = (countsRaw ?? []).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Leads
        </h1>
        <p className="text-sm text-muted-foreground">
          Alle aanvragen voor {tenant.name}. Publieke intake-link:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            /intake/{tenant.slug}
          </code>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          href="/backoffice/leads"
          label={`Alle · ${total}`}
          active={!status}
        />
        {LEAD_STATUSES.map((s) => (
          <FilterChip
            key={s}
            href={`/backoffice/leads?status=${s}`}
            label={`${LEAD_STATUS_LABEL[s]} · ${counts[s]}`}
            active={status === s}
          />
        ))}
      </div>

      <Card className="overflow-hidden">
        {leads.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Geen leads gevonden.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Bron</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Postcode</th>
                <th className="px-4 py-3 font-medium">Binnengekomen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map((l) => (
                <tr
                  key={l.id}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link
                      href={`/backoffice/leads/${l.id}`}
                      className="hover:underline"
                    >
                      {l.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={LEAD_STATUS_VARIANT[l.status]}>
                      {LEAD_STATUS_LABEL[l.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {LEAD_SOURCE_LABEL[l.source]}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {l.email ?? l.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {l.postcode ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {dateFmt.format(new Date(l.created_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "inline-flex items-center rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary"
          : "inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      }
    >
      {label}
    </Link>
  );
}
