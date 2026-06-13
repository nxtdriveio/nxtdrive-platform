import type { CSSProperties } from "react";

type PrimaryGradientOptions = {
  angle?: number;
  startMix?: number;
  endColor?: string;
};

type PrimaryShadowOptions = {
  x?: number;
  y?: number;
  blur?: number;
  spread?: number;
  strength?: number;
};

export function brandPrimaryTint(mix = 16): string {
  return `color-mix(in oklab, var(--primary) ${mix}%, transparent)`;
}

export function brandPrimaryGradient({
  angle = 135,
  startMix = 76,
  endColor = "var(--primary)",
}: PrimaryGradientOptions = {}): string {
  return `linear-gradient(${angle}deg, color-mix(in oklab, var(--primary) ${startMix}%, white), ${endColor})`;
}

export function brandPrimaryGlowShadow({
  x = 0,
  y = 14,
  blur = 28,
  spread = 0,
  strength = 32,
}: PrimaryShadowOptions = {}): string {
  return `${x}px ${y}px ${blur}px ${spread}px color-mix(in oklab, var(--primary) ${strength}%, transparent)`;
}

export function brandPrimaryCtaStyle(
  gradient: PrimaryGradientOptions = {},
  shadow: PrimaryShadowOptions = {},
): CSSProperties {
  return {
    background: brandPrimaryGradient(gradient),
    boxShadow: brandPrimaryGlowShadow(shadow),
  };
}

export function brandPrimaryProgressStyle(
  gradient: Omit<PrimaryGradientOptions, "angle"> = {},
): CSSProperties {
  return {
    background: brandPrimaryGradient({ angle: 90, ...gradient }),
  };
}

export function brandPrimaryActiveSurfaceStyle({
  mix = 11,
  shadowStrength = 18,
  shadowY = 10,
  shadowBlur = 26,
}: {
  mix?: number;
  shadowStrength?: number;
  shadowY?: number;
  shadowBlur?: number;
} = {}): CSSProperties {
  return {
    background: brandPrimaryTint(mix),
    boxShadow: brandPrimaryGlowShadow({
      y: shadowY,
      blur: shadowBlur,
      strength: shadowStrength,
    }),
  };
}
