---
name: White-label theming
description: How tenant white-label branding overrides design tokens in the nxtdrive app
---

# White-label theming

To recolor the app per-tenant, override the **active** design tokens
(`--primary`, `--primary-foreground`, `--primary-soft`, `--ring`) — these are
what `@theme` maps to Tailwind's `*-primary` utilities in
`artifacts/nxtdrive/app/globals.css`.

**Why:** an earlier attempt set `--tenant-primary` / `--tenant-primary-foreground`,
but nothing reads those — they are dead vars. Branding silently never rendered.

**How to apply:** set the overrides **inline** on a wrapper element that contains
the branded subtree (BrandProvider does this on each layout's root). Inline custom
properties inherit and beat both `:root` and `[data-theme="dark"]` for that
subtree, so a single set of overrides works in light and dark mode. Don't try to
redefine `--primary: var(--tenant-primary)` in globals.css — `--tenant-primary`
defaults to `var(--primary)`, which creates a circular reference.

Branding must be resolved server-side (layouts are `force-dynamic`) to avoid a
flash of the wrong palette, and gated on `tenants.white_label_enabled`.
