import type { ComponentType } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  MailCheck,
  RotateCw,
  Search,
  Send,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import {
  type DeliveryStatus,
  loadNotificationDeliveryDashboard,
} from "@/lib/notifications/delivery";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { retryNotificationDeliveryAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  queued: "Wachtrij",
  sent: "Verzonden",
  failed: "Mislukt",
  skipped: "Overgeslagen",
};

const CHANNEL_LABEL: Record<string, string> = {
  all: "Alle kanalen",
  email: "E-mail",
  inapp: "In-app",
  push: "Push",
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  hint: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "danger"
        ? "bg-danger/10 text-danger"
        : tone === "warning"
          ? "bg-warning/10 text-warning"
          : "bg-primary/10 text-primary";

  return (
    <Card className="border-border/80 bg-card/80">
      <CardContent className="flex items-start justify-between gap-3 pt-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <span className={`rounded-full p-2 ${toneClass}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}

export default async function NotificationDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ tenant }, params] = await Promise.all([
    requireActiveTenant(["tenant_admin"]),
    searchParams,
  ]);

  const filters = {
    status: parseStatus(params.status),
    channel: params.channel ?? "all",
    type: params.type ?? "all",
    q: params.q ?? "",
  };

  const service = createServiceRoleClient();
  const { summary, rows, types } = await loadNotificationDeliveryDashboard(
    service,
    tenant.id,
    filters,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            <MailCheck className="h-3.5 w-3.5" aria-hidden />
            Delivery dashboard
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Notificatielevering
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Volg verzonden, geopende en mislukte notificaties. Mislukte
              e-mails kunnen opnieuw worden verzonden met dezelfde bewaarde
              inhoud.
            </p>
          </div>
        </div>
        <Link
          href="/backoffice/instellingen/notificaties"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Terug naar notificaties
        </Link>
      </div>

      {params.retry ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            params.retry === "sent"
              ? "border-success/30 bg-success/10 text-success"
              : params.retry === "blocked"
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {params.retry === "sent"
            ? "Notificatie is opnieuw verzonden."
            : params.retry === "blocked"
              ? "Deze notificatie kan niet exact opnieuw worden verzonden."
              : "Opnieuw proberen is mislukt. Bekijk de foutmelding in de regel."}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Verzonden"
          value={summary.sent}
          hint="E-mailleveringen met succesvolle providerstatus."
          icon={Send}
          tone="success"
        />
        <StatCard
          label="Geopend"
          value={summary.opened}
          hint={`Inclusief ${summary.inAppRead} gelezen in-app meldingen.`}
          icon={Eye}
        />
        <StatCard
          label="Mislukt"
          value={summary.failed}
          hint="Leveringen die actie of configuratie vragen."
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="Wachtrij"
          value={summary.queued}
          hint="Aangemaakt, maar nog niet succesvol afgerond."
          icon={Clock3}
          tone="warning"
        />
        <StatCard
          label="Overgeslagen"
          value={summary.skipped}
          hint="Bewust niet verzonden, zoals ontbrekende ontvangers."
          icon={CheckCircle2}
        />
      </div>

      <Card>
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="text-foreground">Filters</CardTitle>
          <p className="text-sm text-muted-foreground">
            Filter op status, kanaal, type of ontvanger. De tabel toont maximaal
            de 250 meest recente logregels.
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_180px_auto]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                name="q"
                defaultValue={filters.q}
                placeholder="Zoek op ontvanger, onderwerp of fout..."
                className="pl-9"
              />
            </div>
            <Select name="status" defaultValue={filters.status ?? "all"}>
              <option value="all">Alle statussen</option>
              <option value="sent">Verzonden</option>
              <option value="failed">Mislukt</option>
              <option value="queued">Wachtrij</option>
              <option value="skipped">Overgeslagen</option>
            </Select>
            <Select name="channel" defaultValue={filters.channel}>
              <option value="all">Alle kanalen</option>
              <option value="email">E-mail</option>
              <option value="inapp">In-app</option>
              <option value="push">Push</option>
            </Select>
            <Select name="type" defaultValue={filters.type}>
              <option value="all">Alle types</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
            <Button type="submit">Filter toepassen</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold text-foreground">
            Delivery log
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Statussen komen direct uit de productie-log. Er wordt geen demo- of
            fallbackinhoud getoond.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Notificatie</th>
                <th className="px-4 py-3 font-medium">Ontvanger</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Tijdlijn</th>
                <th className="px-4 py-3 font-medium">Fout</th>
                <th className="px-4 py-3 text-right font-medium">Actie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <p className="font-medium text-foreground">
                      Geen notificatieleveringen gevonden.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Pas je filters aan of verstuur eerst een echte notificatie.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-muted/20">
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {CHANNEL_LABEL[row.channel] ?? row.channel}
                        </Badge>
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {row.type}
                        </span>
                      </div>
                      <p className="mt-2 max-w-md font-medium text-foreground">
                        {row.subject || "Zonder onderwerp"}
                      </p>
                      {row.relatedType || row.relatedId ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.relatedType ?? "relatie"} -{" "}
                          {row.relatedId ?? "geen id"}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-foreground">
                      {row.recipientEmail || (
                        <span className="text-muted-foreground">
                          Geen ontvanger
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={statusVariant(row.status)}>
                        {STATUS_LABEL[row.status]}
                      </Badge>
                      {row.retryCount > 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {row.retryCount} retry
                          {row.retryCount === 1 ? "" : "'s"}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-foreground">
                        {row.provider ?? "Nog niet bekend"}
                      </p>
                      {row.providerMessageId ? (
                        <p className="mt-1 max-w-[180px] truncate text-xs text-muted-foreground">
                          {row.providerMessageId}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      <p>Aangemaakt: {formatDateTime(row.createdAt)}</p>
                      {row.sentAt ? (
                        <p>Verzonden: {formatDateTime(row.sentAt)}</p>
                      ) : null}
                      {row.openedAt ? (
                        <p>Geopend: {formatDateTime(row.openedAt)}</p>
                      ) : null}
                      {row.lastRetryAt ? (
                        <p>Laatste retry: {formatDateTime(row.lastRetryAt)}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      {row.error || row.lastRetryError ? (
                        <p className="max-w-sm text-xs text-danger">
                          {truncate(row.error ?? row.lastRetryError ?? "", 180)}
                        </p>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {row.canRetry ? (
                        <form action={retryNotificationDeliveryAction}>
                          <input
                            type="hidden"
                            name="notification_id"
                            value={row.id}
                          />
                          <Button size="sm" variant="outline" type="submit">
                            <RotateCw className="h-3.5 w-3.5" aria-hidden />
                            Opnieuw proberen
                          </Button>
                        </form>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          disabled
                          title={row.retryBlockedReason ?? undefined}
                        >
                          <RotateCw className="h-3.5 w-3.5" aria-hidden />
                          Retry niet beschikbaar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function parseStatus(value: string | undefined): DeliveryStatus | "all" {
  if (
    value === "queued" ||
    value === "sent" ||
    value === "failed" ||
    value === "skipped"
  ) {
    return value;
  }
  return "all";
}

function statusVariant(status: DeliveryStatus): BadgeProps["variant"] {
  if (status === "sent") return "success";
  if (status === "failed") return "danger";
  if (status === "queued") return "warning";
  return "outline";
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
