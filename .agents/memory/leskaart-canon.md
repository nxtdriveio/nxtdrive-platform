---
name: Leskaart canon & roadmap
description: Where the driving-lesson-card (opleidingsdossier) product canon lives and the key grade-driven readiness rule it mandates.
---

# Leskaart (opleidingsdossier) canon

The lesson card is the full student training dossier, not a checklist. Authoritative
product canon: `docs/NXTDRIVE_LESKAART_CANON.md`. Phased build plan:
`docs/LESKAART_ROADMAP.md`. Both sit alongside `docs/NXTDRIVE_CANON.md` and
`docs/PHASE_PLAN.md`.

## Rule: exam readiness is grade-driven (advisory)
Every skill is graded 1–10 with explicit level meaning (8 ≈ bijna examenwaardig,
9 ≈ examenwaardig). Readiness:
- Niet examenrijp: critical skills < 7 OR average < 7.
- Bijna: critical ≥ 8 AND average ≥ 7.5.
- Examenwaardig: critical ≥ 8, average ≥ 8, last 3 lessons stable, theory passed,
  machtiging + (if needed) gezondheidsverklaring done.
- Also a 0–100% Readiness Score in 5 bands (Begin/Ontwikkel/Gevorderd/Bijna/Examenwaardig).
- Always advisory — the instructor stays responsible for the final exam advice.

**Why:** This canon (given 2026-06-01) explicitly supersedes the earlier decision
"no threshold, behaald-tick overrules → 100%". Readiness now derives from the grades, with
"kritieke veiligheidsvaardigheden" (kijkgedrag, voorrang, snelheid, positie,
besluitvorming, gevaarherkenning) never allowed under 8 for a positive exam advice.

**How to apply:** The flat `cbr_competencies` model must become a hierarchical taxonomy
(10 hoofdcategorieën → subcategorie → vaardigheid). The simple per-module grade tasks
(#37–#40) are the seed of this but were planned without a threshold/hierarchy; expect them
to be retired/replanned into the L0–L6 phases in the roadmap. PWAs: instructor is
tablet-first, student/parent is mobile-first, enterprise visual direction.
