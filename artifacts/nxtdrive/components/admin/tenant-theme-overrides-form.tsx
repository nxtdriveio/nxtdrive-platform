"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import {
  applyThemeOverrides,
  THEME_TOKEN_GROUPS,
  THEME_TOKEN_LABELS,
  THEME_TOKEN_KEYS,
} from "@/lib/brand-theme";
import type {
  ThemeMode,
  ThemeOverrides,
  ThemeTokenKey,
  ThemeTokenOverrides,
  ThemeTokenSet,
} from "@/lib/types";
import { ThemeSurfacePreview } from "./theme-surface-preview";

function toModeState(overrides: ThemeTokenOverrides | null | undefined) {
  const next = {} as Record<ThemeTokenKey, string>;
  for (const key of THEME_TOKEN_KEYS) {
    next[key] = overrides?.[key] ?? "";
  }
  return next;
}

function normalizeModeOverrides(state: Record<ThemeTokenKey, string>): ThemeTokenOverrides | null {
  const next: ThemeTokenOverrides = {};
  for (const key of THEME_TOKEN_KEYS) {
    const value = state[key].trim();
    if (value) next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : null;
}

function tokenFieldName(mode: ThemeMode, key: ThemeTokenKey): string {
  return `${mode}_${key}`;
}

export function TenantThemeOverridesForm({
  action,
  resetAction,
  tenantId,
  baseTokens,
  initialOverrides,
  presetName,
}: {
  action: (formData: FormData) => void | Promise<void>;
  resetAction: (formData: FormData) => void | Promise<void>;
  tenantId: string;
  baseTokens: { light: ThemeTokenSet; dark: ThemeTokenSet };
  initialOverrides: ThemeOverrides | null;
  presetName?: string | null;
}) {
  const [overrides, setOverrides] = useState(() => ({
    light: toModeState(initialOverrides?.light),
    dark: toModeState(initialOverrides?.dark),
  }));

  const previewTokens = useMemo(
    () => ({
      light: applyThemeOverrides(baseTokens.light, normalizeModeOverrides(overrides.light)),
      dark: applyThemeOverrides(baseTokens.dark, normalizeModeOverrides(overrides.dark)),
    }),
    [baseTokens, overrides],
  );

  function setOverride(mode: ThemeMode, key: ThemeTokenKey, value: string) {
    setOverrides((current) => ({
      ...current,
      [mode]: {
        ...current[mode],
        [key]: value,
      },
    }));
  }

  function clearOverride(mode: ThemeMode, key: ThemeTokenKey) {
    setOverride(mode, key, "");
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">Tenant theme overrides</CardTitle>
        <p className="text-sm text-muted-foreground">
          Laat een tenant grotendeels op het gekoppelde preset lopen, maar corrigeer hier gericht light/dark tokens wanneer een school toch moet afwijken.
          {presetName ? ` Basispreset: ${presetName}.` : " Zonder preset erft de tenant de platformdefaults."}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <ThemeSurfacePreview
          tokens={previewTokens}
          title="Tenantresultaat"
          description="Preview van het uiteindelijke palet na tenant-overrides."
        />

        <form action={resetAction}>
          <input type="hidden" name="tenant_id" value={tenantId} />
          <Button type="submit" variant="outline" size="sm">
            <RotateCcw className="h-4 w-4" aria-hidden />
            Alleen overrides wissen
          </Button>
        </form>

        <form action={action} className="space-y-6">
          <input type="hidden" name="tenant_id" value={tenantId} />

          <div className="grid gap-6 xl:grid-cols-2">
            {(["light", "dark"] as ThemeMode[]).map((mode) => (
              <div
                key={mode}
                className="rounded-2xl border border-border bg-muted/15 p-4"
              >
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    {mode === "light" ? "Light overrides" : "Dark overrides"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Laat een veld leeg om de presetwaarde te blijven erven.
                  </p>
                </div>

                <div className="space-y-5">
                  {THEME_TOKEN_GROUPS.map((group) => (
                    <div key={`${mode}-${group.key}`} className="space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        {group.label}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {group.fields.map((key) => {
                          const meta = THEME_TOKEN_LABELS[key];
                          const fieldId = `${mode}-${key}-override-${tenantId}`;
                          const overrideValue = overrides[mode][key];
                          const inheritedValue = baseTokens[mode][key];
                          const colorValue = overrideValue || inheritedValue;

                          return (
                            <div key={fieldId} className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <Label htmlFor={fieldId}>{meta.label}</Label>
                                {overrideValue ? (
                                  <button
                                    type="button"
                                    onClick={() => clearOverride(mode, key)}
                                    className="text-[11px] font-medium text-primary hover:underline"
                                  >
                                    Reset
                                  </button>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={colorValue}
                                  onChange={(event) =>
                                    setOverride(mode, key, event.target.value)
                                  }
                                  className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-input"
                                  aria-label={`${mode} ${meta.label} kleur`}
                                />
                                <Input
                                  id={fieldId}
                                  name={tokenFieldName(mode, key)}
                                  value={overrideValue}
                                  onChange={(event) =>
                                    setOverride(mode, key, event.target.value)
                                  }
                                  placeholder={inheritedValue}
                                  className="font-mono"
                                />
                              </div>
                              <p className="text-[11px] leading-4 text-muted-foreground">
                                {meta.description} Erft nu: <span className="font-mono">{inheritedValue}</span>
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

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button type="submit" variant="primary" size="sm">
              Tenant-overrides opslaan
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
