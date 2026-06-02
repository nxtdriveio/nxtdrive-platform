# Future — Leaddashboard voor franchise / multi-vestiging

Status: **toekomst** (niet gebouwd). Sluit aan op Faseplan **Fase F —
Multi-vestiging & Franchise (Modules 16–17)**. Beschrijft hoe het leaddashboard
(Module 1b) opschaalt van één rijschool naar een franchiseformule met meerdere
vestigingen onder één merk.

## Uitgangspunten (canon)

- NXTDRIVE is het platformmerk; rijscholen zijn tenants. Een franchise is een
  groep gerelateerde tenants (of vestigingen binnen een tenant) onder één
  franchisegever. Bouw nooit voor één specifieke franchise.
- White-label blijft een Elite-feature, geactiveerd via
  `tenants.white_label_enabled`.

## Twee mogelijke modellen (kies bij Fase F)

1. **Vestiging-binnen-tenant** (lichter): voeg `locations` toe onder een tenant,
   met `leads.location_id` (nullable, FK, index). RLS blijft op `tenant_id`;
   vestiging is een extra filter-/rechtenlaag erbovenop.
2. **Tenant-per-vestiging + franchiselaag** (zwaarder): elke vestiging is een
   eigen tenant; een `franchises`-tabel groepeert tenants en een
   franchise-rol geeft geaggregeerd inzicht over tenants heen.

Aanbeveling: begin met model 1 (vestiging-binnen-tenant) omdat het de bestaande
RLS-fundering hergebruikt; ga pas naar model 2 als vestigingen juridisch/financ.
echt gescheiden moeten zijn.

## Wat het leaddashboard nodig heeft

1. **Vestiging-dimensie op de lead.**
   - `leads.location_id` + meenemen in `sync_lead_from_intake` (intake-formulier
     per vestiging) en `create_lead_manual`.
   - Lead-routing: nieuwe intake landt bij de vestiging op basis van
     postcode/ophaalregio (hergebruik de route-intelligentie van Module 3c).

2. **Geaggregeerde KPI's met rechten.**
   - Vestigingsmanager: alleen eigen vestiging (Vandaag/Te laat/Hot/conversie).
   - Franchisegever: read-only roll-up over alle vestigingen, nooit muteren in een
     andere vestiging. Implementeer als aparte service-role leesfunctie met een
     expliciete franchise-rolcheck — geen RLS-versoepeling.

3. **Templates uitrollen.**
   - Auto-taakdefinities, scoreweging (`lib/leads/lead-score.ts` is puur en dus
     templatebaar) en cancellation/trial-beleid (`tenant_settings`) als
     franchise-template die per vestiging overschrijfbaar blijft.

4. **Benchmarking.**
   - Conversie per stap (aanvraag→intake→proefles→betaling) vergelijkbaar tussen
     vestigingen voor de franchisegever; per vestiging privacy-veilig geaggregeerd.

## Harde grenzen

- Geen cross-tenant/cross-vestiging schrijfacties zonder expliciete, geauditeerde
  rol. De franchisegever krijgt **inzicht**, geen mutatierecht in een vestiging.
- Audit + lead_events blijven insert-only en tenant-/vestiging-gebonden.
- Scoremodel en automation blijven puur en deterministisch; franchise-templates
  veranderen alleen invoer (gewichten/beleid), nooit de engine.
- Geen hardcoded vestiging- of franchisenamen; alles data-gedreven, demo-data
  blijft beperkt tot `demo-academy`.

## Testuitbreiding

- Vestiging-isolatie: manager van vestiging A ziet/muteert geen leads van
  vestiging B.
- Franchise roll-up is strikt read-only en faalt bij een mutatiepoging.
- Lead-routing plaatst een intake in de juiste vestiging op basis van regio.
