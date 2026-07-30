# Locatiedomein

`location_records` is een tenant-owned business-ID. Google Place ID is uitsluitend provenance en kan worden vernieuwd zonder relaties te breken.

`location_versions` is copy-on-write. Een database-trigger blokkeert update en directe delete; alleen een cascade bij privacyverwijdering is toegestaan. Iedere versie bevat:

- opgesplitste adrescomponenten en geformatteerd adres;
- een volledige coördinatenpair of tweemaal `null`;
- bron, provider, validatiestatus en bevestigingsreden;
- provider-, gebruiker- en creatietijdstippen.

`entity_location_links` gebruikt getypeerde, constrained eigenaarvelden voor leerling, instructeur, vestiging of voertuig. Een generieke polymorfe owner-string is bewust vermeden.

`appointment_stops` is het publicatiecontract. Een draft wordt gepubliceerd; een gepubliceerd record kan alleen worden superseded of geannuleerd. Adres- en coördinatensnapshots blijven immutable.

## Canonieke leesvolgorde

1. actieve typed relation met canonical versie;
2. structured studentvelden tijdens dual read;
3. legacy vrije tekst uitsluitend als zichtbare migratiefallback.

## Duplicaten

Place ID heeft binnen tenant prioriteit als deduplicatiesignaal. Zonder Place ID wordt een genormaliseerde adres/postcodekey gebruikt. Merge blijft previewbaar en rollbackbaar via `location_merge_operations`.
