import { Globe, LayoutTemplate, Palette, Smartphone } from "lucide-react";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function WhiteLabelFoundationCard({
  tenantName,
  logoUrl,
  primaryHost,
  themeColor,
  backofficeName,
  studentName,
  instructorName,
  parentName,
  whiteLabelActive,
}: {
  tenantName: string;
  logoUrl: string | null;
  primaryHost: string;
  themeColor: string;
  backofficeName: string;
  studentName: string;
  instructorName: string;
  parentName: string;
  whiteLabelActive: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          White-label fundament
          {whiteLabelActive ? (
            <Badge variant="success">Actief</Badge>
          ) : (
            <Badge variant="outline">Preview-modus</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border px-3 py-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Palette className="h-3.5 w-3.5" aria-hidden />
              Merknaam
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">{tenantName}</div>
            <div className="mt-1 text-xs text-muted-foreground">Titel, login en manifests gebruiken deze naam.</div>
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Globe className="h-3.5 w-3.5" aria-hidden />
              Primair domein
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">{primaryHost}</div>
            <div className="mt-1 text-xs text-muted-foreground">Host-routing bepaalt publieke branding en manifesten.</div>
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
              Shells
            </div>
            <div className="mt-2 space-y-1 text-xs text-foreground">
              <div>{backofficeName}</div>
              <div>{studentName}</div>
              <div>{instructorName}</div>
              <div>{parentName}</div>
            </div>
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Smartphone className="h-3.5 w-3.5" aria-hidden />
              Theme color
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span
                className="h-6 w-6 rounded-full border border-border"
                style={{ backgroundColor: themeColor }}
              />
              <span className="text-sm font-medium text-foreground">{themeColor}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Gebruikt in meta theme-color en PWA manifests.</div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/85 px-4 py-3 shadow-sm backdrop-blur">
            <NxtdriveLogo
              className="text-base"
              logoUrl={logoUrl}
              brandName={tenantName}
            />
            <div className="flex flex-wrap gap-2">
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: `${themeColor}22`,
                  color: themeColor,
                }}
              >
                Backoffice
              </span>
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: `${themeColor}22`,
                  color: themeColor,
                }}
              >
                Leerling app
              </span>
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: `${themeColor}22`,
                  color: themeColor,
                }}
              >
                Instructeur app
              </span>
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: `${themeColor}22`,
                  color: themeColor,
                }}
              >
                Ouderportaal
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Deze preview laat zien hoe merknaam, logo en primaire kleur als één gedeelde white-label laag door de productshells heen lopen.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
