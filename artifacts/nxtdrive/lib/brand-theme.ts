import type {
  TenantBranding,
  ThemeMode,
  ThemeOverrides,
  ThemePreset,
  ThemeTokenKey,
  ThemeTokenOverrides,
  ThemeTokenSet,
} from "@/lib/types";

export const THEME_TOKEN_GROUPS = [
  {
    key: "surface",
    label: "Shell & surfaces",
    fields: [
      "background",
      "foreground",
      "card",
      "card_foreground",
      "muted",
      "muted_foreground",
      "border",
      "input",
      "popover",
      "popover_foreground",
    ] as ThemeTokenKey[],
  },
  {
    key: "brand",
    label: "Merk & interactie",
    fields: [
      "accent",
      "accent_foreground",
      "primary",
      "primary_foreground",
    ] as ThemeTokenKey[],
  },
  {
    key: "status",
    label: "Statuskleuren",
    fields: ["success", "warning", "danger", "info"] as ThemeTokenKey[],
  },
] as const;

export const THEME_TOKEN_LABELS: Record<
  ThemeTokenKey,
  { label: string; description: string }
> = {
  background: {
    label: "Background",
    description: "Hoofdcanvas van de app-shell.",
  },
  foreground: {
    label: "Foreground",
    description: "Primaire tekstkleur op het canvas.",
  },
  card: {
    label: "Card",
    description: "Basiskleur van kaarten en panelen.",
  },
  card_foreground: {
    label: "Card text",
    description: "Tekstkleur op kaarten en panelen.",
  },
  muted: {
    label: "Muted",
    description: "Secundaire vlakken, badges en rustige panels.",
  },
  muted_foreground: {
    label: "Muted text",
    description: "Tekst op muted vlakken en subtitels.",
  },
  border: {
    label: "Border",
    description: "Standaard randkleur.",
  },
  input: {
    label: "Input",
    description: "Invulvelden en select-achtergronden.",
  },
  popover: {
    label: "Popover",
    description: "Menus, trays en overlays.",
  },
  popover_foreground: {
    label: "Popover text",
    description: "Tekstkleur binnen menus en overlays.",
  },
  accent: {
    label: "Accent",
    description: "Zachte merkvlakken en actieve backplates.",
  },
  accent_foreground: {
    label: "Accent text",
    description: "Tekst op accentvlakken.",
  },
  primary: {
    label: "Primary",
    description: "Hoofdaccent voor CTA's, focus en actieve states.",
  },
  primary_foreground: {
    label: "Primary text",
    description: "Tekst op primaire CTA's en badges.",
  },
  success: {
    label: "Success",
    description: "Succes-, gereed- en positief statusgebruik.",
  },
  warning: {
    label: "Warning",
    description: "Waarschuwingen en bijna-limiet signalen.",
  },
  danger: {
    label: "Danger",
    description: "Fouten, blokkades en kritieke acties.",
  },
  info: {
    label: "Info",
    description: "Informatieve hints en blauwe statusaccenten.",
  },
};

export const THEME_TOKEN_KEYS = Object.keys(
  THEME_TOKEN_LABELS,
) as ThemeTokenKey[];

const DEFAULT_LIGHT_THEME_TOKENS: ThemeTokenSet = {
  background: "#fafafb",
  foreground: "#0b0b14",
  card: "#ffffff",
  card_foreground: "#0b0b14",
  muted: "#f3f3f7",
  muted_foreground: "#6b6b7b",
  border: "#e5e5ec",
  input: "#ffffff",
  popover: "#ffffff",
  popover_foreground: "#0b0b14",
  accent: "#f3eeff",
  accent_foreground: "#392693",
  primary: "#6b4eff",
  primary_foreground: "#ffffff",
  success: "#10a36c",
  warning: "#d97706",
  danger: "#dc2626",
  info: "#2563eb",
};

const DEFAULT_DARK_THEME_TOKENS: ThemeTokenSet = {
  background: "#08080f",
  foreground: "#ececf2",
  card: "#11111d",
  card_foreground: "#ececf2",
  muted: "#1a1a28",
  muted_foreground: "#9a9ab0",
  border: "#25253a",
  input: "#14141f",
  popover: "#11111d",
  popover_foreground: "#ececf2",
  accent: "#1c1733",
  accent_foreground: "#b8a0ff",
  primary: "#8b6fff",
  primary_foreground: "#ffffff",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  info: "#60a5fa",
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickTokenOverrides(value: unknown): ThemeTokenOverrides {
  const obj = asObject(value);
  if (!obj) return {};

  const overrides: ThemeTokenOverrides = {};
  for (const key of THEME_TOKEN_KEYS) {
    const raw = obj[key];
    if (typeof raw === "string" && raw.trim()) {
      overrides[key] = raw.trim();
    }
  }
  return overrides;
}

export function getDefaultThemeTokenSet(mode: ThemeMode): ThemeTokenSet {
  return {
    ...(mode === "light"
      ? DEFAULT_LIGHT_THEME_TOKENS
      : DEFAULT_DARK_THEME_TOKENS),
  };
}

export function normalizeThemeTokenSet(
  value: unknown,
  mode: ThemeMode,
): ThemeTokenSet {
  return {
    ...getDefaultThemeTokenSet(mode),
    ...pickTokenOverrides(value),
  };
}

export function normalizeThemeOverrides(value: unknown): ThemeOverrides | null {
  const obj = asObject(value);
  if (!obj) return null;

  const light = pickTokenOverrides(obj["light"]);
  const dark = pickTokenOverrides(obj["dark"]);

  if (
    Object.keys(light).length === 0 &&
    Object.keys(dark).length === 0
  ) {
    return null;
  }

  return {
    ...(Object.keys(light).length > 0 ? { light } : {}),
    ...(Object.keys(dark).length > 0 ? { dark } : {}),
  };
}

export function applyThemeOverrides(
  base: ThemeTokenSet,
  overrides: ThemeTokenOverrides | null | undefined,
): ThemeTokenSet {
  if (!overrides) return { ...base };
  return { ...base, ...overrides };
}

export function applyLegacyBrandOverrides(
  tokens: ThemeTokenSet,
  branding: Pick<TenantBranding, "primary_color" | "primary_foreground"> | null,
): ThemeTokenSet {
  const next = { ...tokens };

  if (branding?.primary_color) {
    next.primary = branding.primary_color;
  }
  if (branding?.primary_foreground) {
    next.primary_foreground = branding.primary_foreground;
  }

  return next;
}

export function getResolvedThemeTokens(
  preset: Pick<ThemePreset, "tokens_light" | "tokens_dark"> | null,
  overrides: ThemeOverrides | null | undefined,
  branding: Pick<TenantBranding, "primary_color" | "primary_foreground"> | null,
): { light: ThemeTokenSet; dark: ThemeTokenSet } {
  const baseLight = normalizeThemeTokenSet(preset?.tokens_light ?? null, "light");
  const baseDark = normalizeThemeTokenSet(preset?.tokens_dark ?? null, "dark");
  const allowLegacyBrandColors = preset == null;

  const lightBase = applyThemeOverrides(baseLight, overrides?.light);
  const darkBase = applyThemeOverrides(baseDark, overrides?.dark);

  const light = allowLegacyBrandColors
    ? applyLegacyBrandOverrides(lightBase, branding)
    : lightBase;
  const dark = allowLegacyBrandColors
    ? applyLegacyBrandOverrides(darkBase, branding)
    : darkBase;

  return { light, dark };
}

export function buildThemeStyleVars(theme: {
  light: ThemeTokenSet;
  dark: ThemeTokenSet;
}): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const key of THEME_TOKEN_KEYS) {
    const cssKey = key.replaceAll("_", "-");
    vars[`--tenant-light-${cssKey}`] = theme.light[key];
    vars[`--tenant-dark-${cssKey}`] = theme.dark[key];
  }

  return vars;
}

export function buildResolvedThemeStyleVars(
  tokens: ThemeTokenSet,
  mode: ThemeMode,
): Record<string, string> {
  return {
    "--background": tokens.background,
    "--foreground": tokens.foreground,
    "--card": tokens.card,
    "--card-foreground": tokens.card_foreground,
    "--muted": tokens.muted,
    "--muted-foreground": tokens.muted_foreground,
    "--border": tokens.border,
    "--input": tokens.input,
    "--ring": tokens.primary,
    "--primary": tokens.primary,
    "--primary-foreground": tokens.primary_foreground,
    "--accent": tokens.accent,
    "--accent-foreground": tokens.accent_foreground,
    "--popover": tokens.popover,
    "--popover-foreground": tokens.popover_foreground,
    "--success": tokens.success,
    "--warning": tokens.warning,
    "--danger": tokens.danger,
    "--info": tokens.info,
    "--primary-soft":
      mode === "dark"
        ? `color-mix(in oklab, ${tokens.primary} 12%, ${tokens.card})`
        : `color-mix(in oklab, ${tokens.primary} 15%, transparent)`,
    "--shell-glow-strong":
      mode === "dark"
        ? `color-mix(in oklab, ${tokens.primary} 10%, transparent)`
        : `color-mix(in oklab, ${tokens.primary} 14%, transparent)`,
    "--shell-glow-medium":
      mode === "dark"
        ? `color-mix(in oklab, ${tokens.primary} 7%, transparent)`
        : `color-mix(in oklab, ${tokens.primary} 10%, transparent)`,
    "--shell-glow-soft":
      mode === "dark"
        ? `color-mix(in oklab, ${tokens.primary} 5.5%, transparent)`
        : `color-mix(in oklab, ${tokens.primary} 8%, transparent)`,
    "--shell-glow-faint":
      mode === "dark"
        ? `color-mix(in oklab, ${tokens.primary} 4%, transparent)`
        : `color-mix(in oklab, ${tokens.primary} 6%, transparent)`,
    "--hero-accent-soft":
      mode === "dark"
        ? `color-mix(in oklab, ${tokens.primary} 11%, transparent)`
        : `color-mix(in oklab, ${tokens.primary} 14%, transparent)`,
    "--hero-surface-start":
      mode === "dark"
        ? `color-mix(in oklab, ${tokens.primary} 12%, ${tokens.card})`
        : `color-mix(in oklab, ${tokens.primary} 10%, ${tokens.card})`,
    "--hero-surface-mid":
      mode === "dark"
        ? `color-mix(in oklab, ${tokens.primary} 5%, ${tokens.background})`
        : `color-mix(in oklab, ${tokens.primary} 4%, ${tokens.background})`,
    "--hero-surface-end":
      mode === "dark"
        ? `color-mix(in oklab, ${tokens.primary} 3%, ${tokens.background})`
        : tokens.background,
    "--cta-gradient-start":
      mode === "dark"
        ? `color-mix(in oklab, ${tokens.primary} 68%, white)`
        : `color-mix(in oklab, ${tokens.primary} 76%, white)`,
    "--cta-gradient-end":
      mode === "dark"
        ? `color-mix(in oklab, ${tokens.primary} 90%, ${tokens.card})`
        : `color-mix(in oklab, ${tokens.primary} 92%, ${tokens.card})`,
    "--cta-shadow-color":
      mode === "dark"
        ? `color-mix(in oklab, ${tokens.primary} 18%, transparent)`
        : `color-mix(in oklab, ${tokens.primary} 20%, transparent)`,
  };
}
