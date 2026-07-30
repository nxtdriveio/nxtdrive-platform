# Privacy en locaties

Exacte locaties zijn persoonsgegevens. Autorisatie volgt het doel:

- leerling: eigen gepubliceerde afspraakstop en eigen profielrelaties;
- instructeur: eigen toegewezen gepubliceerde stops;
- planner: operationele exacte locaties binnen tenant/branchscope;
- manager: aggregaten boven privacydrempel;
- platformadmin: PII-vrij gebruik en kosten;
- support: technische status en correlation ID.

AVG-export schema 2 bevat locatie-records, alle versies, relaties, validatie-events, voorstellen, afspraakstops en handmatige reisstatussen binnen het subjectscope. PII-vrije Maps-usage kan niet aan een subject worden toegerekend en wordt als zodanig verklaard.

Anonimisering wist structured en legacy directe velden, subjectrelaties, orphan canonical records en providerreferenties en invalideert tenantcache. Gepubliceerde historische stops blijven volgens lesretentie bestaan; het deletierapport noemt dit expliciet.

Postcodeanalytics geeft geen exacte adressen/coördinaten terug, gebruikt maximaal postcode4 of grover en onderdrukt cellen onder zowel personen- als afsprakendrempels.

Offline dagstops staan versleuteld in IndexedDB, verlopen aan het einde van de operationele dag en worden bij desktoplogout samen met de sleutel verwijderd.
