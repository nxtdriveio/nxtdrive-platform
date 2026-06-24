# NXTDRIVE PWA Canon v1.0

## Doel

NXTDRIVE bevat twee primaire PWA-apps:

1. NXTDRIVE Leerling
2. NXTDRIVE Instructeur

Deze apps zijn geen gewone responsive webpagina's.

Ze moeten voelen als echte mobiele/tablet-apps:
- snel
- overzichtelijk
- touch-first
- offline-tolerant
- installeerbaar
- rolgestuurd
- minimalistisch
- taakgericht

De PWA's draaien standaard onder NXTDRIVE-branding.

White-label branding is alleen beschikbaar voor tenants met white-label pakket.

---

# Algemene PWA Principes

## App-first, niet website-first

De PWA's mogen niet voelen als een verkleinde desktop backoffice.

Geen:
- zware tabellen
- kleine knoppen
- complexe filters
- desktop navigatie
- te veel tekst
- onnodige menu's

Wel:
- kaarten
- grote knoppen
- duidelijke acties
- snelle statusinformatie
- bottom navigation of tablet split layout
- weinig klikken
- duidelijke voortgang

---

# Centrale Login

## Domein

```text
app.nxtdrive.nl
```

Alle app-gebruikers loggen hier in.

Na login bepaalt NXTDRIVE automatisch:

```text
student → leerling PWA
instructor → instructeur PWA
tenant_admin → backoffice
platform_admin → platform dashboard
```

Een gebruiker hoeft niet handmatig te kiezen, tenzij hij meerdere rollen heeft.

---

# PWA App Types

## 1. NXTDRIVE Leerling

### Primair apparaat

```text
Smartphone
```

### Primair scherm

```text
Mobile portrait
```

### Doelgroep

- leerlingen
- jonge bestuurders
- ouders/verzorgers later

### Gebruiksmomenten

Leerling opent app om snel te zien:

- wanneer is mijn volgende les?
- hoeveel tegoed heb ik?
- wat moet ik oefenen?
- wat is mijn voortgang?
- staat er nog een factuur open?
- moet ik nog iets regelen voor CBR?
- heb ik theoriehuiswerk?

---

# Leerling PWA Design Canon

## Layout

De leerlingapp is mobile-first en portrait-first.

Gebruik:

- bottom navigation
- compacte header
- cards
- progress bars
- status badges
- duidelijke CTA's
- eenvoudige flows

Geen desktop sidebars.

---

## Hoofdnavigatie Leerling

Bottom navigation:

```text
Home
Lessen
Voortgang
Theorie
Account
```

Eventueel later:

```text
Betalingen
Documenten
Berichten
```

---

## Leerling Home

De homepagina toont direct:

1. Volgende les
2. Resterend tegoed
3. Voortgang richting examen
4. Theorie/huiswerk
5. Openstaande actie

Voorbeeld:

```text
Volgende les
Woensdag 18:00
Instructeur: Mike
Ophaallocatie: Thuis

Tegoed
7,5 uur beschikbaar

Examenrijpheid
68%

Actie nodig
CBR-machtiging nog niet geregeld
```

---

## Leerling Lessen

Toont:

- komende lessen
- eerdere lessen
- geannuleerde lessen
- lesdetails
- instructeur
- locatie
- status

Acties:

- les bekijken
- wijziging aanvragen
- annuleren volgens regels
- contact opnemen

---

## Leerling Voortgang

Toont:

- leskaart samenvatting
- gemiddelde score
- kritieke vaardigheden
- laatste lesnotitie
- aandachtspunten
- examenrijpheid

Scoreschaal:

```text
N, 1 t/m 8
```

Statussen:

```text
N = niet beoordeeld
1-3 = uitleg en begeleiding nodig
4-5 = basis in opbouw
6-7 = zelfstandig(er) toepassen
8 = examenwaardig
```

---

## Leerling Theorie

Toont:

- theorievoortgang
- huiswerk
- oefenonderwerpen
- zwakke onderdelen
- theorie-examendatum
- status theorie gehaald/niet gehaald

---

## Leerling Betalingen

Toont:

- facturen
- betaalstatus
- betaalverzoeken
- pakketinformatie
- termijnbetalingen
- betalingsgeschiedenis

Mollie later.

---

## Leerling Account

Toont:

- persoonlijke gegevens
- contactgegevens
- ouder/verzorger
- privacy/voorwaarden
- app instellingen
- uitloggen

---

# Leerling PWA UX Regels

## Snelheid

De leerling moet binnen 5 seconden kunnen zien:

```text
wanneer is mijn volgende les?
hoeveel tegoed heb ik?
wat moet ik nog doen?
```

---

## Taalgebruik

Gebruik eenvoudige taal.

Niet:

```text
CBR autorisatie ontbreekt
```

Wel:

```text
Je moet je rijschool nog machtigen bij het CBR.
```

---

## Actiegericht

Elke waarschuwing moet een actie hebben.

Voorbeeld:

```text
CBR-machtiging ontbreekt
[Bekijk uitleg]
```

---

# 2. NXTDRIVE Instructeur

## Primair apparaat

```text
Tablet
```

## Primair scherm

```text
Landscape
```

## Doelgroep

- instructeurs
- zelfstandige rijschoolhouders
- praktijkbegeleiders

## Gebruiksmomenten

De instructeur gebruikt de app:

- voor de les
- tijdens korte pauzes
- na de les
- onderweg
- in de auto

De app moet dus extreem snel en praktisch zijn.

---

# Instructeur PWA Design Canon

## Layout

De instructeurapp is tablet-first en landscape-first.

Gebruik split layout:

```text
Links:
dagplanning / lessenlijst

Rechts:
geselecteerde leerling / lesdetails / acties
```

Op mobiel mag dit stapelen, maar tablet landscape is leidend.

---

## Hoofdnavigatie Instructeur

Tablet layout:

```text
Vandaag
Planning
Leerlingen
Taken
Account
```

Niet te veel menu-items.

---

## Instructeur Vandaag

Toont:

- alle lessen van vandaag
- starttijd
- leerling
- type les
- locatie
- status
- openstaande waarschuwingen

Voorbeelden waarschuwingen:

```text
Tegoed laag
Factuur open
CBR-machtiging ontbreekt
Theorie niet gehaald
```

---

## Lesdetail Scherm

Toont:

- leerlingnaam
- lestype
- tijd
- ophaallocatie
- resterend tegoed
- laatste aandachtspunt
- vorige lesnotitie
- CBR-status
- theorie-status
- openstaande taken

Snelle acties:

```text
Start les
Rond les af
Voeg notitie toe
Werk leskaart bij
Maak taak
Bel leerling
WhatsApp leerling
```

---

## Les Afronden Flow

Moet in maximaal 60 seconden kunnen.

Stappen:

```text
1. Kies geoefende onderdelen
2. Pas RIS-scores N/1-8 aan
3. Voeg korte notitie toe
4. Voeg aandachtspunt volgende les toe
5. Rond les af
6. Tegoed wordt verwerkt
7. Leerling ziet update
```

Geen lange formulieren.

---

## Leskaart Instructeur

De instructeur ziet:

- hoofdcategorieën
- vaardigheden
- huidige score
- laatste wijziging
- kritieke onderdelen
- examenrijpheid

Scores:

```text
N, 1 t/m 8
```

Kritieke onderdelen moeten extra zichtbaar zijn.

---

## Taken Aanmaken

Instructeur kan tijdens of na een les snel een taak maken.

Voorbeeld:

```text
Taak:
Controleer CBR-machtiging

Afdeling:
Administratie

Gekoppeld aan:
Leerling
```

---

# PWA Installatie Canon

## Manifest

Elke app heeft eigen metadata.

### Leerling

```json
{
  "name": "NXTDRIVE Leerling",
  "short_name": "Leerling",
  "display": "standalone",
  "orientation": "portrait",
  "start_url": "/student",
  "theme_color": "#0F172A",
  "background_color": "#0F172A"
}
```

### Instructeur

```json
{
  "name": "NXTDRIVE Instructeur",
  "short_name": "Instructeur",
  "display": "standalone",
  "orientation": "landscape",
  "start_url": "/instructor",
  "theme_color": "#0F172A",
  "background_color": "#0F172A"
}
```

---

# Splash Screen Canon

## Native/PWA Launch

Splash screen moet premium voelen.

Elementen:

- NXTDRIVE logo
- appnaam
- donkere/navy achtergrond
- subtiele gradient
- loading indicator
- korte statusregel

Voor leerling:

```text
NXTDRIVE Leerling
Jouw rijopleiding in één overzicht
```

Voor instructeur:

```text
NXTDRIVE Instructeur
Vandaag slim en overzichtelijk lesgeven
```

---

# Offline & Slechte Verbinding

## Basisregels

De PWA moet niet stuk aanvoelen bij slechte verbinding.

Minimaal:

- offline fallback scherm
- laatst geladen planning tonen indien mogelijk
- duidelijke melding
- geen data verliezen bij conceptnotities

---

## Offline Concepten

Later:

- lesnotitie offline opslaan
- synchroniseren zodra verbinding terug is
- conflictcontrole

Voor MVP:

```text
Alleen online-first met nette foutmeldingen.
```

---

# Push Notificaties

## Leerling

Voorbeelden:

- lesherinnering
- factuur open
- theoriehuiswerk
- les gewijzigd
- examen gepland

---

## Instructeur

Voorbeelden:

- nieuwe les
- annulering
- taak toegewezen
- leerling zonder tegoed
- planning gewijzigd

Push is later, niet MVP verplicht.

---

# Google Play Canon

De PWA's moeten later geschikt zijn voor Google Play via Trusted Web Activity.

Apps:

```text
NXTDRIVE Leerling
package: com.nxtdrive.student

NXTDRIVE Instructeur
package: com.nxtdrive.instructor
```

Benodigd:

- manifest
- service worker
- icons
- assetlinks.json
- HTTPS
- privacy policy
- data safety info
- role-based routing

---

# White-label PWA Canon

Standaard:

```text
NXTDRIVE branding
```

White-label tenants kunnen later krijgen:

- eigen logo
- eigen kleuren
- eigen appnaam
- eigen splash
- eigen domein
- eigen app metadata

Maar alleen indien:

```text
white_label_enabled = true
```

---

# PWA Security Canon

Elke app moet server-side controleren:

```text
- is gebruiker ingelogd?
- welke tenant?
- welke rol?
- mag deze gebruiker deze route zien?
- mag deze gebruiker deze data zien?
```

Nooit vertrouwen op alleen frontend checks.

---

# PWA MVP Scope

## Leerling MVP

Moet bevatten:

- login
- home
- komende lessen
- leshistorie
- voortgang
- tegoed
- facturen status
- CBR checklist
- theorie status
- account

---

## Instructeur MVP

Moet bevatten:

- login
- vandaag
- planning
- leerling openen
- les afronden
- leskaart scores aanpassen
- notitie toevoegen
- taak aanmaken
- tegoed waarschuwing
- CBR waarschuwing

---

# Niet in MVP

Nog niet:

- offline sync
- push notifications
- native Android build
- Google Play publicatie
- volledige white-label app metadata
- AI summaries
- Mollie payments
- CBR sync

Wel voorbereiden in architectuur.

---

# Replit Bouwinstructie

Gebruik deze PWA canon bij alle app-ontwikkeling.

Belangrijk:

- Student PWA is mobile portrait first.
- Instructor PWA is tablet landscape first.
- Apps moeten niet voelen als dashboards.
- Apps moeten voelen als echte mobiele/tablet software.
- Default branding is NXTDRIVE.
- White-label pas later.
- Role-based routing is verplicht.
- Server-side authorization is verplicht.
- Maak herbruikbare app shell components.
- Maak aparte shells voor student en instructor.
- Maak aparte manifest metadata waar mogelijk.
- Voeg premium splash/loading screens toe.
- Houd MVP online-first, maar offline-tolerant.
