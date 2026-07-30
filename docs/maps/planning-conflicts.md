# Reistijdconflicten

Een planningsmutatie moet in preview én opnieuw binnen commit worden gecontroleerd:

1. vorige en volgende afspraak bepalen;
2. relevante routelegs berekenen;
3. tenant-/type-/regiobuffer toepassen;
4. `FEASIBLE`, `TIGHT`, `INFEASIBLE`, `UNKNOWN` of `FALLBACK_ESTIMATE` tonen;
5. bij commit dezelfde serverpolicy gebruiken.

De centrale evaluator geeft beschikbare tijd, vereiste tijd, tekort, methode, `asOf`, confidence en uitleg. Onbekend of fallback volgt expliciet tenantbeleid.

Overrides bewaren de originele immutable routebeslissing, actor, reden, tijd, methode, buffer en routeactualiteit. Redenen zijn minimaal tien tekens en rollen staan in de gepubliceerde policy.

De bestaande planningkernel blijft harde beschikbaarheid, rayon, voertuig en overlap eerst filteren. Route Matrix wordt alleen voor de overgebleven shortlist gebruikt.
