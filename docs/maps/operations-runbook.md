# Operations-runbook Maps & Routing

## Dagelijkse controle

- Controleer Control Center op hard-limit-, budget-, reconciliatie- en circuitbreakerwaarschuwingen.
- Vergelijk usage-ledger en rollups op achterstand.
- Controleer providerfoutpercentages, latency en fallbackratio.
- Controleer of geen providercredential in logs of browserbundles staat.

## Acties

- Soft limit: informeer tenant en verlaag kostbare suggestiefuncties.
- Hard limit: behoud handmatige adresinvoer en lijstplanning; blokkeer alleen providerafhankelijke verrijking.
- Providerstoring: open circuit, toon de veilige modus en voorkom retry-stormen.
- Reconciliatieverschil: zet kostentoerekening op `estimated`, onderzoek prijsversie, deduplicatie en providerfactuur.
- Rollupachterstand: herstel de job idempotent vanaf het laatste volledige tijdvak.

Handmatige overrides vereisen reden, actor, tijdstip en afloopdatum. Sluit een incident pas wanneer backlog, circuitstatus en tenantcommunicatie zijn gecontroleerd.

