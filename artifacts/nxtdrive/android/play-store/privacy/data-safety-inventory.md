# Data Safety-inventaris — NXTDRIVE Instructeur 1.0.0

Status: `OWNER_AND_LEGAL_APPROVAL_REQUIRED`

Dit is de technische bron voor de Data Safety-antwoorden in Play Console. Het
is geen automatisch ingediende verklaring. De eigenaar blijft verantwoordelijk
voor de antwoorden en moet de exacte productieconfiguratie en de door Google
gehanteerde definities controleren.

## Releasegrens

- package: `io.nxtdrive.instructeur`;
- versie: `1.0.0`;
- eerste gereserveerde versionCode: `202607291`;
- volledig native Kotlin/Jetpack Compose;
- geen WebView, Capacitor, advertentie-SDK, analytics-SDK of crash-SDK;
- Android-permission: uitsluitend `android.permission.INTERNET`;
- productie-API: `https://nxtdrive.io/api/mobile/*`;
- AI is geen functie van de native 1.0.0-app en staat platformbreed standaard
  uit.

## Gegevens die de app kan verzamelen

“Verzameld” betekent hier dat gegevens via de app naar de NXTDRIVE-service
kunnen gaan of daar worden opgehaald. Verwerkersdoorgifte kan volgens
Play-beleid onder uitzonderingen op “gedeeld” vallen; vul dit niet zonder
controle van de actuele Play-definitie in.

| Play-categorie                                              | Concrete gegevens                                                     | Verplicht?                                          | Doel                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| Persoonlijke informatie — naam                              | instructeurnaam, leerlingnaam                                         | account vereist; leerling afhankelijk van handeling | appfunctionaliteit, accountbeheer              |
| Persoonlijke informatie — e-mailadres                       | login/instructeur; optioneel leerlingadres                            | login vereist; leerling optioneel                   | authenticatie, accountbeheer, communicatie     |
| Persoonlijke informatie — gebruikers-ID's                   | account-, tenant-, leerling- en record-ID's                           | ja                                                  | authenticatie, autorisatie, appfunctionaliteit |
| Persoonlijke informatie — adres                             | postcode, adres, plaats, ophaaladres bij leerlingaanmaak              | optioneel                                           | lesplanning en leerlingbeheer                  |
| Persoonlijke informatie — telefoon                          | telefoonnummer leerling                                               | optioneel                                           | leerlingbeheer en communicatie                 |
| Berichten — andere in-appberichten                          | inhoud, afzender en tijdstip van gesprekken                           | optioneel                                           | communicatie tussen rijschool en leerling      |
| Appactiviteit — andere door gebruikers gegenereerde content | taken, notities, les- en afspraakgegevens, beschikbaarheid            | afhankelijk van gebruik                             | kernfunctionaliteit                            |
| Financiële informatie — aankoopgeschiedenis/tegoed          | lestegoed in minuten en door instructeur toegevoegde uren             | afhankelijk van gebruik                             | lesadministratie                               |
| App-info en prestaties                                      | appversie, releasekanaal, request- en foutreferentie                  | ja bij API-gebruik                                  | beveiliging, fraudepreventie, betrouwbaarheid  |
| Account- en authenticatiegegevens                           | e-mailadres, tijdelijk ingevoerd wachtwoord, access- en refresh-token | ja voor login                                       | authenticatie en beveiliging                   |

Het wachtwoord wordt alleen via TLS aan de authenticatiedienst aangeboden en
niet door de app opgeslagen. Access- en refresh-tokens worden op het toestel
AES-GCM-versleuteld met een niet-exporteerbare Android-Keystore-sleutel.

## Niet verzameld door de native 1.0.0-app

- geen apparaatlocatie en geen locatiepermission;
- geen contacten of apparaatagenda;
- geen foto's, video's, audio of camera/microfoon;
- geen gezondheids-, biometrische of advertentiegegevens;
- geen volledige betaalkaart- of bankgegevens;
- geen browsercookies, advertentie-ID of analyticsprofiel;
- geen dossierdocumentupload vanuit de native app;
- geen autonome AI-analyse of uitsluitend geautomatiseerde besluitvorming.

Een handmatig ingevoerd les- of ophaaladres is persoonlijke informatie, geen via
de sensor verkregen apparaatlocatie.

## Delen en leveranciers

De native app communiceert rechtstreeks met NXTDRIVE en de door NXTDRIVE
gebruikte Supabase-authenticatie via de servercontracten. Backendfuncties kunnen,
afhankelijk van de rijschoolconfiguratie, gebruikmaken van:

- Supabase voor authenticatie, database en opslag;
- SendGrid voor transactionele e-mail;
- Mollie voor betalingen;
- browser-pushdiensten voor webpush;
- Google Maps voor webkaartfuncties;
- OpenAI alleen voor optionele web-AI die standaard uit staat.

De native 1.0.0-app bevat zelf geen SDK van SendGrid, Mollie, Google Maps,
Firebase Analytics, OpenAI of een advertentienetwerk. Beoordeel toch alle
server-side doorgiften die door een native actie kunnen worden gestart.

## Beveiliging en verwijdering

- gegevens zijn tijdens transport versleuteld via HTTPS; cleartext is
  geblokkeerd;
- Android-back-up en data-extractie zijn uitgeschakeld;
- API-routes valideren Bearer-token, gebruiker, rol, tenant en relevante
  recordtoegang;
- sessietokens staan versleuteld op het toestel en worden bij uitloggen lokaal
  gewist;
- privacybeleid: `https://nxtdrive.io/privacy`;
- accountverwijdering: `https://nxtdrive.io/account-verwijderen`;
- verwijdering kan in de app via **Meer → Instellingen → Account en gegevens
  verwijderen** worden gestart.

## Verplichte aftekening vóór indiening

- [ ] Exacte AAB-dependencies en merged manifest opnieuw gecontroleerd.
- [ ] Productieconfiguratie en actieve backendleveranciers bevestigd.
- [ ] Per Play-categorie “collected”, “shared”, verplicht/optioneel, doel en
      ephemeral-status ingevuld en door eigenaar gecontroleerd.
- [ ] Privacytekst en Data Safety-antwoorden zijn inhoudelijk gelijk.
- [ ] Verwijderings- en privacy-URL zijn publiek en getest.
- [ ] Eigenaar/privacyjurist heeft de definitieve Play Console-verklaring
      goedgekeurd en de datum vastgelegd.
