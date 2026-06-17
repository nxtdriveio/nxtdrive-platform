"use client";

import { useMemo, useState } from "react";
import { Bell, LayoutDashboard, Search, Sparkles, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buildResolvedThemeStyleVars } from "@/lib/brand-theme";
import { brandPrimaryCtaStyle } from "@/lib/brand-styles";
import type { ThemeMode, ThemeTokenSet } from "@/lib/types";

type PreviewSurface = "student" | "instructor" | "backoffice";

const SURFACE_LABELS: Record<PreviewSurface, string> = {
  student: "Student",
  instructor: "Instructeur",
  backoffice: "Backoffice",
};

export function ThemeSurfacePreview({
  tokens,
  title = "Preset preview",
  description = "Controleer light/dark en de drie belangrijkste shells voordat je opslaat.",
  initialMode = "dark",
  initialSurface = "student",
}: {
  tokens: { light: ThemeTokenSet; dark: ThemeTokenSet };
  title?: string;
  description?: string;
  initialMode?: ThemeMode;
  initialSurface?: PreviewSurface;
}) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [surface, setSurface] = useState<PreviewSurface>(initialSurface);

  const vars = useMemo(
    () => buildResolvedThemeStyleVars(tokens[mode], mode),
    [mode, tokens],
  );

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-full border border-border bg-background/70 p-1">
            {(["light", "dark"] as ThemeMode[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  mode === value ? "bg-primary-soft text-primary" : "text-muted-foreground"
                }`}
              >
                {value === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
          <div className="flex rounded-full border border-border bg-background/70 p-1">
            {(["student", "instructor", "backoffice"] as PreviewSurface[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSurface(value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  surface === value ? "bg-primary-soft text-primary" : "text-muted-foreground"
                }`}
              >
                {SURFACE_LABELS[value]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[1.6rem] border border-border/80"
        style={{ ...vars, colorScheme: mode }}
      >
        {surface === "student" ? <StudentPreview /> : null}
        {surface === "instructor" ? <InstructorPreview /> : null}
        {surface === "backoffice" ? <BackofficePreview /> : null}
      </div>
    </div>
  );
}

function StudentPreview() {
  return (
    <div
      className="bg-background p-4 text-foreground"
      style={{
        background:
          "radial-gradient(circle at 14% 0%, var(--shell-glow-soft), transparent 28%), linear-gradient(180deg, color-mix(in oklab, var(--background) 96%, white), var(--background))",
      }}
    >
      <div className="mx-auto max-w-[20rem] space-y-3 rounded-[2rem] border border-border/80 bg-card/92 p-3 shadow-[0_16px_44px_color-mix(in_oklab,var(--foreground)_10%,transparent)]">
        <div className="flex items-center justify-between">
          <div className="rounded-full border border-border bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Student shell
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground">
              <Bell className="h-3.5 w-3.5" />
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary">
              DG
            </span>
          </div>
        </div>

        <div
          className="rounded-[1.4rem] border border-border/70 p-4"
          style={{
            background:
              "linear-gradient(145deg, var(--hero-surface-start), var(--hero-surface-mid) 55%, var(--hero-surface-end))",
          }}
        >
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
            Home
          </p>
          <h4 className="mt-2 text-lg font-semibold">Goedemorgen, Danny</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Overzicht, voortgang en directe acties in tenantstijl.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border/70 bg-card/80 p-3">
              <p className="text-[0.65rem] uppercase tracking-[0.24em] text-muted-foreground">
                Volgende les
              </p>
              <p className="mt-2 text-xl font-semibold">08:00</p>
              <p className="text-xs text-muted-foreground">Mike Jansen</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/80 p-3">
              <p className="text-[0.65rem] uppercase tracking-[0.24em] text-muted-foreground">
                Examenstatus
              </p>
              <p className="mt-2 text-xl font-semibold">82%</p>
              <Badge variant="success" className="mt-2">
                Goed op weg
              </Badge>
            </div>
          </div>
          <button
            type="button"
            className="theme-cta mt-4 inline-flex h-10 w-full items-center justify-center rounded-full px-4 text-sm font-semibold text-primary-foreground"
            style={brandPrimaryCtaStyle()}
          >
            Bekijk planning
          </button>
        </div>
      </div>
    </div>
  );
}

function InstructorPreview() {
  return (
    <div
      className="grid gap-0 md:grid-cols-[14rem_minmax(0,1fr)]"
      style={{
        background:
          "radial-gradient(circle at 100% 0%, var(--shell-glow-medium), transparent 24%), linear-gradient(180deg, color-mix(in oklab, var(--background) 98%, white), var(--background))",
      }}
    >
      <aside className="border-r border-border/80 bg-card/72 p-3">
        <div className="rounded-[1.2rem] border border-border/70 bg-background/75 p-3">
          <p className="text-sm font-semibold">Vandaag</p>
          <div className="mt-3 space-y-2">
            {[
              { time: "08:00", label: "Mike Jansen", badge: "Rijles" },
              { time: "11:40", label: "Proefles Kevin", badge: "Proefles" },
            ].map((row, index) => (
              <div
                key={row.time}
                className="rounded-xl border border-border/70 px-3 py-2"
                style={{
                  borderLeftWidth: "3px",
                  borderLeftColor:
                    index === 0 ? "var(--primary)" : "var(--success)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold tabular-nums">{row.time}</span>
                  <Badge variant={index === 0 ? "primary" : "success"}>{row.badge}</Badge>
                </div>
                <p className="mt-1 text-sm font-medium">{row.label}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
      <div className="space-y-3 p-3">
        <div className="flex items-center gap-3 rounded-[1.2rem] border border-border/70 bg-card/78 px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Zoek in leerlingen, taken en lessen...</span>
          <span className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground">
            <Bell className="h-3.5 w-3.5" />
          </span>
        </div>
        <div
          className="rounded-[1.5rem] border border-border/70 p-4"
          style={{
            background:
              "linear-gradient(145deg, var(--hero-surface-start), var(--hero-surface-mid) 55%, var(--hero-surface-end))",
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Instructeur cockpit
              </p>
              <h4 className="mt-2 text-xl font-semibold">Vandaag</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Dagritme, KPI's en directe acties in één shell.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[["Lessen", "6"], ["Taken", "4"]].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-border/70 bg-card/78 px-3 py-2">
                  <p className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackofficePreview() {
  return (
    <div
      className="space-y-3 bg-background p-4"
      style={{
        background:
          "radial-gradient(circle at 8% 0%, var(--shell-glow-faint), transparent 24%), linear-gradient(180deg, color-mix(in oklab, var(--background) 97%, #05070d), var(--background))",
      }}
    >
      <div className="flex items-center gap-3 rounded-[1.2rem] border border-border/70 bg-card/78 px-4 py-3">
        <LayoutDashboard className="h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-semibold">Backoffice overzicht</p>
          <p className="text-xs text-muted-foreground">
            KPI's, alerts en commerciële gezondheid.
          </p>
        </div>
        <Badge variant="warning" className="ml-auto">
          Limiet
        </Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: "Leerlingen", value: "142", tone: "primary" },
          { label: "Open facturen", value: "8", tone: "warning" },
          { label: "Actieve alerts", value: "3", tone: "danger" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[1.2rem] border border-border/70 bg-card/78 p-3"
          >
            <p className="text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-2 text-2xl font-semibold">{item.value}</p>
            <div className="mt-3">
              <Badge
                variant={
                  item.tone === "warning"
                    ? "warning"
                    : item.tone === "danger"
                      ? "danger"
                      : "primary"
                }
              >
                Live
              </Badge>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-[1.2rem] border border-border/70 bg-card/78 p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Alerts</p>
            <Badge variant="danger">3 open</Badge>
          </div>
          <div className="space-y-2">
            {[
              { title: "Staffing limiet bereikt", tone: "warning" },
              { title: "1 factuur te laat", tone: "danger" },
            ].map((item) => (
              <div key={item.title} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/65 px-3 py-2">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{
                    background:
                      item.tone === "danger"
                        ? "color-mix(in oklab, var(--danger) 14%, transparent)"
                        : "color-mix(in oklab, var(--warning) 14%, transparent)",
                    color: item.tone === "danger" ? "var(--danger)" : "var(--warning)",
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">Platformbeheerders zien direct de impact.</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[1.2rem] border border-border/70 bg-card/78 p-3">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Snelle acties</p>
          </div>
          <div className="space-y-2">
            {["Tenant openen", "Preset koppelen", "Brand preview"].map((label) => (
              <button
                key={label}
                type="button"
                className="theme-cta inline-flex h-10 w-full items-center justify-center rounded-xl px-3 text-sm font-medium text-primary-foreground"
                style={brandPrimaryCtaStyle()}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
