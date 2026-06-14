"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getDefaultThemeTokenSet,
  THEME_TOKEN_GROUPS,
  THEME_TOKEN_LABELS,
} from "@/lib/brand-theme";
import type { ThemeMode, ThemePreset, ThemeTokenKey } from "@/lib/types";
import { ThemeSurfacePreview } from "./theme-surface-preview";

function tokenFieldName(mode: ThemeMode, key: ThemeTokenKey): string {
  return `${mode}_${key}`;
}

export function ThemePresetForm({
  action,
  preset,
  heading,
  submitLabel,
  usageCount = 0,
  assignedTenantNames = [],
}: {
  action: (formData: FormData) => void | Promise<void>;
  preset?: ThemePreset | null;
  heading: string;
  submitLabel: string;
  usageCount?: number;
  assignedTenantNames?: string[];
}) {
  const readOnly = preset?.is_system === true;
  const [tokens, setTokens] = useState(() => ({
    light: preset?.tokens_light ?? getDefaultThemeTokenSet("light"),
    dark: preset?.tokens_dark ?? getDefaultThemeTokenSet("dark"),
  }));

  function updateToken(mode: ThemeMode, key: ThemeTokenKey, value: string) {
    setTokens((current) => ({
      ...current,
      [mode]: {
        ...current[mode],
        [key]: value,
      },
    }));
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{heading}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {preset
                ? "Beheer een light/dark palet op presetniveau. De tenant koppelt later alleen nog naar deze preset."
                : "Maak een nieuw light/dark palet dat later aan een of meer tenants gekoppeld kan worden."}
            </p>
          </div>
          {preset ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-muted-foreground">
                slug: {preset.slug}
              </span>
              <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-muted-foreground">
                {usageCount} tenant{usageCount === 1 ? "" : "s"} gekoppeld
              </span>
              {preset.is_system ? (
                <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-muted-foreground">
                  systeempreset
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <ThemeSurfacePreview tokens={tokens} />
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-6">
          {preset ? <input type="hidden" name="preset_id" value={preset.id} /> : null}

          <fieldset disabled={readOnly} className="space-y-6 disabled:opacity-60">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={preset ? `name-${preset.id}` : "name"}>Naam</Label>
                  <Input
                    id={preset ? `name-${preset.id}` : "name"}
                    name="name"
                    defaultValue={preset?.name ?? ""}
                    placeholder="Graphite Gold Custom"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={preset ? `slug-${preset.id}` : "slug"}>Slug</Label>
                  <Input
                    id={preset ? `slug-${preset.id}` : "slug"}
                    name="slug"
                    defaultValue={preset?.slug ?? ""}
                    placeholder="graphite-gold-custom"
                    required
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={preset ? `description-${preset.id}` : "description"}>
                  Beschrijving
                </Label>
                <Textarea
                  id={preset ? `description-${preset.id}` : "description"}
                  name="description"
                  defaultValue={preset?.description ?? ""}
                  placeholder="Korte uitleg voor wanneer dit palette bedoeld is."
                  rows={3}
                />
              </div>
            </div>

            {preset ? (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={preset.is_active}
                  className="h-4 w-4 rounded border-border bg-input text-primary focus:ring-ring"
                />
                Preset actief houden voor selectie en toewijzing
              </label>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-2">
              {(["light", "dark"] as ThemeMode[]).map((mode) => (
                <div
                  key={mode}
                  className="rounded-2xl border border-border bg-muted/15 p-4"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {mode === "light" ? "Light mode" : "Dark mode"}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Alle kernkleuren voor deze modevariant.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    {THEME_TOKEN_GROUPS.map((group) => (
                      <div key={`${mode}-${group.key}`} className="space-y-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            {group.label}
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {group.fields.map((key) => {
                            const meta = THEME_TOKEN_LABELS[key];
                            const fieldId = `${mode}-${key}-${preset?.id ?? "new"}`;
                            const value = tokens[mode][key];

                            return (
                              <div key={fieldId} className="space-y-1.5">
                                <Label htmlFor={fieldId}>{meta.label}</Label>
                                <div className="flex items-center gap-2">
                                  <input
                                    id={fieldId}
                                    type="color"
                                    value={value}
                                    onChange={(event) =>
                                      updateToken(mode, key, event.target.value)
                                    }
                                    className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-input"
                                  />
                                  <Input
                                    name={tokenFieldName(mode, key)}
                                    value={value}
                                    onChange={(event) =>
                                      updateToken(mode, key, event.target.value)
                                    }
                                    className="font-mono"
                                  />
                                </div>
                                <p className="text-[11px] leading-4 text-muted-foreground">
                                  {meta.description}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          {readOnly ? (
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Systeempresets zijn read-only. Maak een nieuwe custom preset als
              variant en koppel die vervolgens aan tenants.
            </div>
          ) : null}

          {assignedTenantNames.length > 0 ? (
            <div className="rounded-xl border border-border bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
              Gekoppeld aan: {assignedTenantNames.join(", ")}.
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <Button type="submit" size="sm" disabled={readOnly}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
