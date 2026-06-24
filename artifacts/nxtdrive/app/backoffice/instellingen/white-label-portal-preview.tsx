import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  auditThemeContrast,
  type ThemeContrastCheck,
} from "@/lib/brand-theme";
import {
  resolveBrandAppName,
  type BrandingSurface,
} from "@/lib/branding";
import type { Tenant, ThemeTokenSet } from "@/lib/types";

type PortalPreview = {
  surface: BrandingSurface;
  label: string;
  heading: string;
  meta: string;
  primaryAction: string;
};

function formatRatio(check: ThemeContrastCheck): string {
  return check.ratio === null ? "n.v.t." : `${check.ratio.toFixed(1)}:1`;
}

function PortalPreviewCard({
  preview,
  tenant,
  logoUrl,
  tokens,
}: {
  preview: PortalPreview;
  tenant: Tenant;
  logoUrl: string | null;
  tokens: ThemeTokenSet;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{
        backgroundColor: tokens.background,
        borderColor: tokens.border,
        color: tokens.foreground,
      }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-3"
        style={{
          borderColor: tokens.border,
          backgroundColor: tokens.card,
          color: tokens.card_foreground,
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="h-6 w-auto max-w-[120px] object-contain"
            />
          ) : (
            <span className="text-sm font-semibold">
              {resolveBrandAppName(tenant, preview.surface)}
            </span>
          )}
        </div>
        <span
          className="rounded-full px-2 py-1 text-[11px] font-medium"
          style={{
            backgroundColor: tokens.muted,
            color: tokens.muted_foreground,
          }}
        >
          {preview.label}
        </span>
      </div>
      <div className="space-y-4 px-4 py-4">
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: tokens.muted_foreground }}
          >
            {preview.meta}
          </p>
          <h3 className="mt-2 text-lg font-semibold leading-tight">
            {preview.heading}
          </h3>
        </div>
        <div
          className="rounded-xl border px-3 py-3"
          style={{
            backgroundColor: tokens.card,
            borderColor: tokens.border,
            color: tokens.card_foreground,
          }}
        >
          <p className="text-sm font-medium">Vandaag klaar voor gebruik</p>
          <p
            className="mt-1 text-xs leading-5"
            style={{ color: tokens.muted_foreground }}
          >
            Header, knoppen, badges en tekst volgen dezelfde tenant tokens.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex rounded-lg px-3 py-2 text-sm font-semibold"
          style={{
            backgroundColor: tokens.primary,
            color: tokens.primary_foreground,
          }}
        >
          {preview.primaryAction}
        </button>
      </div>
    </div>
  );
}

function ContrastList({
  title,
  checks,
}: {
  title: string;
  checks: ThemeContrastCheck[];
}) {
  const failing = checks.filter((check) => !check.passes);

  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-foreground">{title}</p>
        <Badge variant={failing.length === 0 ? "success" : "warning"}>
          {failing.length === 0
            ? "Contrast goed"
            : `${failing.length} waarschuwing${failing.length === 1 ? "" : "en"}`}
        </Badge>
      </div>
      <div className="mt-3 space-y-2">
        {checks.map((check) => (
          <div
            key={check.key}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <span className="min-w-0 text-muted-foreground">{check.label}</span>
            <span
              className={
                check.passes
                  ? "font-medium text-emerald-700 dark:text-emerald-300"
                  : "font-medium text-amber-700 dark:text-amber-300"
              }
            >
              {formatRatio(check)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WhiteLabelPortalPreview({
  tenant,
  logoUrl,
  lightTokens,
  darkTokens,
  whiteLabelActive,
}: {
  tenant: Tenant;
  logoUrl: string | null;
  lightTokens: ThemeTokenSet;
  darkTokens: ThemeTokenSet;
  whiteLabelActive: boolean;
}) {
  const previews: PortalPreview[] = [
    {
      surface: "backoffice",
      label: "Admin",
      heading: "Operationeel overzicht",
      meta: "Dashboard",
      primaryAction: "Nieuwe actie",
    },
    {
      surface: "instructor",
      label: "Instructeur",
      heading: "Cockpit vandaag",
      meta: "Rijlessen",
      primaryAction: "Les starten",
    },
    {
      surface: "student",
      label: "Leerling",
      heading: "Jouw volgende stap",
      meta: "Mijn reis",
      primaryAction: "Bekijk plan",
    },
    {
      surface: "parent",
      label: "Ouder",
      heading: "Voortgang en afspraken",
      meta: "Ouderportaal",
      primaryAction: "Bekijk voortgang",
    },
  ];

  const lightChecks = auditThemeContrast(lightTokens);
  const darkChecks = auditThemeContrast(darkTokens);
  const failingCount =
    lightChecks.filter((check) => !check.passes).length +
    darkChecks.filter((check) => !check.passes).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Portal previews
          <Badge variant={whiteLabelActive ? "success" : "outline"}>
            {whiteLabelActive ? "Live stijl" : "Voorbeeld"}
          </Badge>
          {failingCount > 0 ? (
            <Badge variant="warning">Contrastcontrole</Badge>
          ) : null}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Bekijk dezelfde huisstijl per portaal voordat je wijzigingen live zet.
          De contrastcontrole waarschuwt automatisch als tekst slecht leesbaar
          dreigt te worden.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {previews.map((preview) => (
            <PortalPreviewCard
              key={preview.surface}
              preview={preview}
              tenant={tenant}
              logoUrl={logoUrl}
              tokens={lightTokens}
            />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ContrastList title="Light mode" checks={lightChecks} />
          <ContrastList title="Dark mode" checks={darkChecks} />
        </div>
      </CardContent>
    </Card>
  );
}
