import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type BrandedPwaPublication,
  type BrandedPwaSurface,
  brandedPwaStatusLabel,
  brandedPwaSurfaceLabel,
} from "@/lib/tenant/branded-pwa-publication";
import {
  resetBrandedPwaPublication,
  saveBrandedPwaPublication,
} from "./actions";

const SURFACES: BrandedPwaSurface[] = [
  "admin",
  "instructor",
  "student",
  "parent",
];

function pwaRedirect(code: string, reason?: string): never {
  const params = new URLSearchParams({ pwa: code });
  if (reason) params.set("reason", reason.slice(0, 180));
  redirect(`/backoffice/instellingen?${params.toString()}`);
}

async function saveBrandedPwaPublicationForm(formData: FormData) {
  "use server";

  const result = await saveBrandedPwaPublication(formData);
  if (!result.ok) pwaRedirect("error", result.error);
  pwaRedirect("saved");
}

async function resetBrandedPwaPublicationForm(formData: FormData) {
  "use server";

  const result = await resetBrandedPwaPublication(formData);
  if (!result.ok) pwaRedirect("error", result.error);
  pwaRedirect("reset");
}

export function BrandedPwaPublicationPanel({
  publication,
  isPlatformAdmin,
  whiteLabelAvailable,
}: {
  publication: BrandedPwaPublication;
  isPlatformAdmin: boolean;
  whiteLabelAvailable: boolean;
}) {
  const disabled = !isPlatformAdmin || !whiteLabelAvailable;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Branded PWA-publicatie
          <Badge
            variant={
              publication.status === "published"
                ? "success"
                : publication.status === "review"
                  ? "warning"
                  : "outline"
            }
          >
            {brandedPwaStatusLabel(publication.status)}
          </Badge>
          <Badge variant="outline">Alleen platformbeheer</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Volledig branded PWA-publicatie blijft bewust een platformbeheer-flow.
          Klantadmins zien de status en scope, maar kunnen deze publicatie niet
          zelfstandig activeren.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isPlatformAdmin ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            Alleen NXTDRIVE platformbeheerders kunnen branded PWA-publicaties
            starten, pauzeren of wijzigen. Dit voorkomt losse app-shells zonder
            technische review.
          </div>
        ) : null}
        {!whiteLabelAvailable ? (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Deze tenant heeft geen actief white-label recht. Publicatie blijft
            vergrendeld totdat white-label beschikbaar is.
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          {SURFACES.map((surface) => (
            <div
              key={surface}
              className="rounded-xl border border-border bg-muted/20 px-4 py-3"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Portaal
              </p>
              <p className="mt-1 font-medium text-foreground">
                {brandedPwaSurfaceLabel(surface)}
              </p>
              <Badge
                className="mt-3"
                variant={
                  publication.surfaces.includes(surface) ? "success" : "outline"
                }
              >
                {publication.surfaces.includes(surface)
                  ? "In scope"
                  : "Niet gepubliceerd"}
              </Badge>
            </div>
          ))}
        </div>

        <form action={saveBrandedPwaPublicationForm} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Status</span>
              <select
                name="status"
                defaultValue={publication.status}
                disabled={disabled}
                className="h-10 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground"
              >
                <option value="not_requested">Niet aangevraagd</option>
                <option value="review">In review</option>
                <option value="published">Gepubliceerd</option>
                <option value="paused">Gepauzeerd</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Notitie voor audit en support</span>
              <textarea
                name="notes"
                defaultValue={publication.notes ?? ""}
                disabled={disabled}
                rows={3}
                maxLength={500}
                placeholder="Bijvoorbeeld: app-shells gecontroleerd, manifest getest en iconset gepubliceerd."
                className="w-full resize-none rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </label>
          </div>

          <fieldset
            className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 md:grid-cols-4"
            disabled={disabled}
          >
            <legend className="px-1 text-sm font-medium text-foreground">
              Portalen in publicatie
            </legend>
            {SURFACES.map((surface) => (
              <label
                key={surface}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  name="surfaces"
                  value={surface}
                  defaultChecked={publication.surfaces.includes(surface)}
                  className="h-4 w-4 accent-primary"
                />
                {brandedPwaSurfaceLabel(surface)}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={disabled}>
              Publicatiestatus opslaan
            </Button>
            <Button
              formAction={resetBrandedPwaPublicationForm}
              type="submit"
              variant="outline"
              size="sm"
              disabled={!isPlatformAdmin}
            >
              Terugzetten
            </Button>
            <p className="text-xs text-muted-foreground">
              Laatst bijgewerkt:{" "}
              {publication.updated_at
                ? new Date(publication.updated_at).toLocaleString("nl-NL")
                : "nog niet"}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
