"use client";

import { useState } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveBranding } from "@/app/backoffice/instellingen/actions";

export function BrandingForm({
  initialLogoUrl,
  initialPrimaryColor,
  initialPrimaryForeground,
  initialWelcomeMessage,
  disabled = false,
}: {
  initialLogoUrl: string;
  initialPrimaryColor: string;
  initialPrimaryForeground: string;
  initialWelcomeMessage: string;
  disabled?: boolean;
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [primary, setPrimary] = useState(initialPrimaryColor || "#6b4eff");
  const [foreground, setForeground] = useState(
    initialPrimaryForeground || "#ffffff",
  );
  const [welcomeMessage, setWelcomeMessage] = useState(initialWelcomeMessage);

  return (
    <form action={saveBranding} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="logo_url">Logo-URL</Label>
        <Input
          id="logo_url"
          name="logo_url"
          type="url"
          inputMode="url"
          placeholder="https://…/logo.png"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Publieke URL naar je logo (PNG of SVG). Laat leeg voor het
          NXTDRIVE-logo.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="primary_color">Primaire kleur</Label>
          <div className="flex items-center gap-2">
            <input
              aria-label="Primaire kleur kiezen"
              type="color"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              disabled={disabled}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-input"
            />
            <Input
              id="primary_color"
              name="primary_color"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              disabled={disabled}
              placeholder="#6b4eff"
              className="font-mono"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="primary_foreground">Tekst op primaire kleur</Label>
          <div className="flex items-center gap-2">
            <input
              aria-label="Tekstkleur kiezen"
              type="color"
              value={foreground}
              onChange={(e) => setForeground(e.target.value)}
              disabled={disabled}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-input"
            />
            <Input
              id="primary_foreground"
              name="primary_foreground"
              value={foreground}
              onChange={(e) => setForeground(e.target.value)}
              disabled={disabled}
              placeholder="#ffffff"
              className="font-mono"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="welcome_message">Welkomstbericht op de inlogpagina</Label>
        <textarea
          id="welcome_message"
          name="welcome_message"
          rows={2}
          maxLength={120}
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          disabled={disabled}
          placeholder="Welkom bij [Rijschool] — log in op je leerlingportaal."
          className="w-full resize-none rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="flex justify-between text-xs text-muted-foreground">
          <span>
            Wordt getoond op de inlogpagina wanneer white-label actief is. Laat
            leeg voor de standaardtekst.
          </span>
          <span className="shrink-0 pl-2">
            {welcomeMessage.length}/120
          </span>
        </p>
      </div>

      <div className="space-y-2">
        <Label>Voorbeeld</Label>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo voorbeeld"
              className="h-8 w-auto max-w-[160px] object-contain"
            />
          ) : (
            <span className="text-sm text-muted-foreground">Geen logo</span>
          )}
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium"
            style={{ backgroundColor: primary, color: foreground }}
          >
            Voorbeeldknop
          </button>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: `color-mix(in oklab, ${primary} 16%, transparent)`,
              color: primary,
            }}
          >
            Label
          </span>
        </div>
      </div>

      <Button type="submit" size="sm" disabled={disabled}>
        Huisstijl opslaan
      </Button>
    </form>
  );
}
