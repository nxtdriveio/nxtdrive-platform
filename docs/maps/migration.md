# Locatiemigratie

De migratie is additief en cohortgestuurd.

1. Inventariseer bestaande `locations`, leerlingvelden, leads en afspraken.
2. Maak in dry-run een kandidaat `location_record` met eerste versie.
3. Rapporteer ontbrekende, conflicterende en niet-valideerbare gegevens.
4. Migreer een tenantcohort en bewaar bron-id en migratierun.
5. Vergelijk aantallen en operationele uitkomsten.
6. Activeer de nieuwe leesroute alleen na parity.

De bestaande tabel wordt niet hernoemd of semantisch hergebruikt. Gepubliceerde afspraken krijgen een stop-snapshot; latere profielwijzigingen herschrijven het verleden niet. Rollback schakelt de featureflag terug en verwijdert geen nieuw opgebouwde auditdata.
