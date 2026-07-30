# Routeoptimalisatie

Routeoptimalisatie in NXTDrive is advies, geen automatische planning.

## Proces

1. De planner selecteert een scope, datum en constraints.
2. NXTDrive bewaart de invoer als immutable scenario.
3. De provider levert een voorstel met expliciete aannames.
4. De planner vergelijkt huidig en voorgesteld op reistijd, afstand, lege kilometers en overtredingen.
5. Alleen een geautoriseerde planner kan geselecteerde mutaties toepassen.
6. Toepassing en terugdraaien worden afzonderlijk geaudit.

De servicegrens gebruikt OAuth/IAM en nooit een browser-key. Een providerresultaat wordt afgewezen wanneer stops ontbreken, dubbel voorkomen of buiten de opgegeven constraints vallen. Multi-instructeuroptimalisatie blijft achter een tenantfeatureflag.

## Publicatiegrens

`route_optimization_scenarios` en `route_optimization_mutations` scheiden berekenen, reviewen en toepassen. Geen enkele providerresponse wijzigt zelfstandig lessen. Het scenario toont de reden per mutatie en bewaart de gebruikte catalogus-, verkeers- en beleidsversies.

Bij uitval blijft het bestaande rooster leidend. Een Haversine-inschatting mag alleen als gelabelde indicatie worden getoond en nooit als optimalisatie worden gepubliceerd.
