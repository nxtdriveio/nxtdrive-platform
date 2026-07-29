# Data Safety-inventaris — voorbereidende technische inventaris

Status: `LEGAL_REVIEW_REQUIRED`. Dit document is invoer voor de Play Console en
is geen namens de eigenaar ingediende juridische verklaring.

| Datacategorie             | Voorbeeld in NXTDRIVE                                | Doel                           | Verzameld | Gedeeld                                             | Opmerking                                                   |
| ------------------------- | ---------------------------------------------------- | ------------------------------ | --------- | --------------------------------------------------- | ----------------------------------------------------------- |
| Accountgegevens           | naam, e-mailadres, gebruikers-ID, rol                | authenticatie en toegang       | ja        | alleen met geconfigureerde verwerkers               | tenant- en rolgebonden                                      |
| Persoonsgegevens leerling | naam, contactgegevens, geboortedatum indien ingevuld | lesadministratie               | ja        | alleen met geconfigureerde verwerkers               | minimale velden verschillen per tenant                      |
| Appactiviteit             | lessen, observaties, reflecties, taken, berichten    | kernfunctionaliteit en audit   | ja        | alleen met geconfigureerde verwerkers               | concepten zijn niet leerlingzichtbaar                       |
| Financiële gegevens       | facturen, betalingen en tegoeden                     | administratie                  | mogelijk  | betaalprovider indien geconfigureerd                | geen volledige kaartgegevens in de app                      |
| Foto's en documenten      | door bevoegde gebruikers geüploade dossierbestanden  | dossierfunctie                 | mogelijk  | storageverwerker                                    | uploadbeleid en rechten moeten per flow worden geverifieerd |
| Berichten                 | gesprekstekst en metadata                            | communicatie                   | mogelijk  | communicatieverwerker indien geconfigureerd         | geen verkoop van gegevens                                   |
| Diagnostische gegevens    | foutreferentie, requestmetadata, appversie           | beveiliging en betrouwbaarheid | ja        | observabilityprovider alleen wanneer geconfigureerd | log geen wachtwoorden of inhoudelijke dossiers              |
| App-/device-identifiers   | sessie-, installatie- en correlation-ID's            | beveiliging en foutanalyse     | mogelijk  | geconfigureerde verwerkers                          | definitieve SDK-scan vóór indiening                         |

## Transport, opslag en verwijdering

- Android blokkeert cleartextverkeer; productie navigeert alleen naar
  `https://nxtdrive.io`.
- Tijdelijke lokale conceptwaarden kunnen via Android Keystore-backed
  AES-GCM-opslag worden bewaard.
- Native veilige opslag wordt gewist na succesvolle synchronisatie, bij
  uitloggen en volgens de productretentieflow.
- Accountverwijdering: `https://nxtdrive.io/account-verwijderen`.
- Privacybeleid: `https://nxtdrive.io/privacy`.

## Verplichte controles vóór Play-indiening

1. Maak een dependency- en SDK-inventaris van de exacte AAB.
2. Bevestig alle geconfigureerde Supabase-, betaal-, e-mail-, push- en
   observabilityverwerkers.
3. Valideer of optionele uploads, notificaties of diagnostiek in de release
   actief zijn.
4. Laat privacy/eigenaar de Play-antwoorden goedkeuren.
