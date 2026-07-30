# Repository-inventaris

| Onderdeel | Bestaande bron | Baseline |
| --- | --- | --- |
| Browser Maps | `lib/maps/loader.ts` | gedeelde legacy loader, optionele key |
| Autocomplete | `components/places-autocomplete.tsx` | legacy widget, vrije-tekstfallback |
| Route Matrix | `lib/trial-lessons/route.ts` | directe Google-client, Haversinefallback |
| Planning | `lib/planning-core/*` | service-area- en capabilitygedreven |
| Locaties | verspreide SQL-kolommen | geen canonical/versioned domein |
| Privacy-export | `lib/privacy/service.ts` | geen canonical locatieprojectie |
| Deletion | `execute_student_anonymization` | geen maps-cache/location cleanup |
| CSP | `lib/security/headers.ts` | nonce, geen unsafe-eval |
| Maps metering | niet aanwezig | geen tenant- of SKU-ledger |
| Kosten | niet aanwezig | geen prijsversies/reconciliatie |
| Control Center | niet aanwezig | geen mapscockpit |

Baselinecommando’s:

```text
pnpm run typecheck
pnpm run test:unit
```

Beide commando’s waren groen vóór de eerste implementatiewijziging.
