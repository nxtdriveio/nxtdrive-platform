# Accountverwijdering-checklist

- [x] De repository bevat een publieke `/account-verwijderen`-route.
- [x] Een gebruiker zonder login of app kan via een vooringevulde e-mail een
      verzoek starten.
- [x] Een ingelogde gebruiker kan het verzoek aan account en tenant koppelen.
- [x] De pagina legt verificatie, termijn, gevolgen en mogelijke bewaring uit.
- [x] De technische flow controleert een legal hold vóór anonimisering.
- [x] De technische flow anonimiseert directe leerlingidentificatoren en
      verwijdert bij accountverwijdering de authenticatiegebruiker.
- [x] Lokale native sessieciphertext wordt bij uitloggen verwijderd.
- [ ] Privacy/eigenaar heeft de verificatieprocedure en bewaarcategorieën
      formeel goedgekeurd.
- [ ] De verantwoordelijke heeft een operationele mailbox-SLA, vervanging en
      escalatie voor `privacy@nxtdrive.io` ingericht.
- [ ] Een end-to-end verzoek is in staging met synthetische data uitgevoerd en
      het resultaat is door privacy/eigenaar gecontroleerd.
- [ ] De Play Console deletion URL is ingevuld en handmatig getest.
