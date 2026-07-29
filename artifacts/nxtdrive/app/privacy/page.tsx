import Link from "next/link";

const privacyEmail = "privacy@nxtdrive.io";

export const metadata = {
  title: "Privacybeleid — NXTDRIVE",
  description:
    "Privacybeleid voor het NXTDRIVE-platform en de NXTDRIVE Instructeur-app.",
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Public, authentication-free privacy policy for the NXTDRIVE web platform and
 * native Android app. Keep the wording aligned with the technical inventory in
 * android/play-store/privacy before every release.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 text-foreground sm:px-6 sm:py-14">
      <header className="border-b border-border pb-8">
        <p className="text-sm font-semibold text-primary">NXTDRIVE</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Privacybeleid
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Dit beleid beschrijft hoe persoonsgegevens worden verwerkt in het
          NXTDRIVE-platform, de leerling- en ouderomgeving en de volledig native
          Android-app NXTDRIVE Instructeur.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Versie 1.0 · laatst bijgewerkt op 29 juli 2026
        </p>
      </header>

      <div className="grid gap-10 py-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav
          aria-label="Inhoudsopgave"
          className="lg:sticky lg:top-6 lg:self-start"
        >
          <p className="text-sm font-semibold">Op deze pagina</p>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
            {[
              ["reikwijdte", "1. Reikwijdte"],
              ["verantwoordelijkheid", "2. Wie is verantwoordelijk?"],
              ["gegevens", "3. Welke gegevens?"],
              ["doelen", "4. Doelen en grondslagen"],
              ["bronnen", "5. Bronnen"],
              ["ontvangers", "6. Ontvangers en leveranciers"],
              ["internationaal", "7. Buiten de EER"],
              ["bewaren", "8. Bewaartermijnen"],
              ["beveiliging", "9. Beveiliging"],
              ["keuzes", "10. Keuzes en AI"],
              ["rechten", "11. Jouw rechten"],
              ["kinderen", "12. Minderjarigen"],
              ["wijzigingen", "13. Wijzigingen"],
              ["contact", "14. Contact en klachten"],
            ].map(([id, label]) => (
              <li key={id}>
                <a
                  className="hover:text-primary hover:underline"
                  href={`#${id}`}
                >
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="min-w-0 space-y-10 text-sm leading-7">
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-5">
            <p className="font-semibold">Kort samengevat</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Een aangesloten rijschool bepaalt waarom leerling-, les- en
                bedrijfsgegevens in NXTDRIVE worden gebruikt.
              </li>
              <li>
                NXTDRIVE levert en beveiligt het platform en verwerkt die
                gegevens in beginsel in opdracht van de rijschool.
              </li>
              <li>
                NXTDRIVE verkoopt geen persoonsgegevens en de native
                instructeursapp bevat geen advertentie-SDK.
              </li>
              <li>
                Je kunt inzage, correctie, export of verwijdering aanvragen bij
                je rijschool of via{" "}
                <Link
                  className="font-semibold text-primary hover:underline"
                  href="/account-verwijderen"
                >
                  accountverwijdering
                </Link>
                .
              </li>
            </ul>
          </div>

          <Section id="reikwijdte" title="1. Reikwijdte">
            <p>
              Dit beleid geldt wanneer je NXTDRIVE gebruikt als leerling, ouder
              of voogd, instructeur, medewerker, beheerder, proeflesaanvrager of
              contactpersoon van een rijschool. Het geldt ook voor het gebruik
              van nxtdrive.io, de webportalen, mobiele API&apos;s en NXTDRIVE
              Instructeur voor Android.
            </p>
            <p>
              Een rijschool kan aanvullend een eigen privacybeleid hebben. Dat
              beleid is leidend voor verwerkingen waarvoor de rijschool zelf het
              doel en de middelen bepaalt.
            </p>
          </Section>

          <Section
            id="verantwoordelijkheid"
            title="2. Wie is verantwoordelijk?"
          >
            <h3 className="font-semibold">De aangesloten rijschool</h3>
            <p>
              Voor leerlingdossiers, rijopleidingen, planning, lesvoortgang,
              communicatie, facturatie en personeelsplanning is de aangesloten
              rijschool doorgaans de verwerkingsverantwoordelijke. De naam en
              contactgegevens van die rijschool staan in je account, berichten,
              overeenkomst of factuur. NXTDRIVE handelt voor deze gegevens als
              verwerker op basis van afspraken met de rijschool.
            </p>
            <h3 className="pt-2 font-semibold">NXTDRIVE</h3>
            <p>
              De aanbieder van NXTDRIVE, zoals juridisch genoemd in de
              SaaS-overeenkomst of factuur van de rijschool, is zelfstandig
              verantwoordelijk voor de persoonsgegevens die nodig zijn voor
              platformbeveiliging, toegangsbeheer, contract- en
              leveranciersbeheer, eigen facturatie, ondersteuning en de naleving
              van wettelijke verplichtingen. Het centrale privacycontact is{" "}
              <a
                className="text-primary hover:underline"
                href={`mailto:${privacyEmail}`}
              >
                {privacyEmail}
              </a>
              .
            </p>
            <p className="rounded-lg border border-border bg-muted/40 p-4 text-muted-foreground">
              Weet je niet wie jouw verzoek moet behandelen? Mail NXTDRIVE. Wij
              sturen het verzoek veilig door of ondersteunen de rijschool bij de
              afhandeling, zonder dat je zelf de juridische rolverdeling hoeft
              uit te zoeken.
            </p>
          </Section>

          <Section
            id="gegevens"
            title="3. Welke persoonsgegevens verwerken we?"
          >
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[42rem] border-collapse text-left">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="p-3 font-semibold">Categorie</th>
                    <th className="p-3 font-semibold">Voorbeelden</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border align-top">
                  <tr>
                    <td className="p-3 font-medium">Account en organisatie</td>
                    <td className="p-3">
                      Naam, e-mailadres, gebruikers-ID, rol, rijschool,
                      vestiging, bevoegdheden en accountstatus.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium">Contact en profiel</td>
                    <td className="p-3">
                      Telefoonnummer, adres of postcode, geboortedatum indien
                      ingevuld en gekoppelde ouder- of voogdrelatie.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium">Opleiding en planning</td>
                    <td className="p-3">
                      Lessen, proeflessen, afspraken, beschikbaarheid,
                      opleidingsmethode, voortgang, leskaarten, observaties,
                      reflecties, aandachtspunten en examengerelateerde
                      planning.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium">Communicatie en taken</td>
                    <td className="p-3">
                      In-appberichten, notificatievoorkeuren, taken,
                      leerlingkoppelingen en afleverstatus van berichten.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium">Financieel</td>
                    <td className="p-3">
                      Pakketten, lestegoed, facturen, bedragen, betaalstatus en
                      betaalreferenties. NXTDRIVE ontvangt via de app geen
                      volledige betaalkaartgegevens.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium">Documenten</td>
                    <td className="p-3">
                      Bestanden die een bevoegde gebruiker aan een dossier
                      toevoegt, inclusief bestandsnaam en uploadmetadata.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium">Techniek en beveiliging</td>
                    <td className="p-3">
                      Sessies, IP- en requestmetadata, tijdstippen, appversie,
                      apparaat- of installatiekenmerken, foutreferenties,
                      autorisatiebeslissingen en auditloggegevens.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium">Ondersteuning</td>
                    <td className="p-3">
                      Je vraag, correspondentie en informatie die nodig is om
                      een incident of privacyverzoek op te lossen.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              NXTDRIVE is niet bedoeld voor vrije vastlegging van bijzondere
              persoonsgegevens, zoals medische gegevens, strafrechtelijke
              gegevens of kopieën van identiteitsbewijzen. Voer zulke gegevens
              alleen in als de rijschool daarvoor een aantoonbare noodzaak,
              geldige grondslag en passende beveiliging heeft.
            </p>
          </Section>

          <Section id="doelen" title="4. Doelen en grondslagen">
            <p>
              Gegevens kunnen, afhankelijk van je relatie, worden gebruikt voor:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                het aanmaken en beveiligen van accounts en het verlenen van
                toegang op basis van rol, rijschool en vestiging;
              </li>
              <li>
                het plannen, uitvoeren en administreren van rijopleidingen,
                lessen, voortgang, communicatie, taken, voertuigen en
                beschikbaarheid;
              </li>
              <li>
                facturatie, betalingen, tegoeden en de financiële administratie;
              </li>
              <li>
                ondersteuning, foutoplossing, misbruikpreventie,
                informatiebeveiliging, audit en continuïteit;
              </li>
              <li>
                het voldoen aan wettelijke verplichtingen en het instellen,
                uitoefenen of onderbouwen van rechtsvorderingen;
              </li>
              <li>
                optionele functies die je rijschool activeert, zoals e-mail,
                webpush, kaarten, online betalen of uitsluitend op verzoek
                gegenereerde AI-concepten.
              </li>
            </ul>
            <p>
              Mogelijke AVG-grondslagen zijn uitvoering van een overeenkomst,
              een wettelijke verplichting, een gerechtvaardigd belang (zoals
              platform- en fraudebeveiliging) en, alleen waar dat passend en
              vereist is, toestemming. De rijschool bepaalt en documenteert de
              grondslag voor haar eigen processen. Als een verwerking op
              toestemming berust, kun je die toestemming voor de toekomst
              intrekken zonder dat eerdere rechtmatige verwerking daardoor
              onrechtmatig wordt.
            </p>
          </Section>

          <Section id="bronnen" title="5. Waar komen gegevens vandaan?">
            <p>
              Gegevens komen van jouzelf, van je rijschool of bevoegde
              medewerkers, van een gekoppelde ouder of voogd, uit je gebruik van
              de app en van ingeschakelde leveranciers. Een betaalprovider geeft
              bijvoorbeeld de status en referentie van een betaling terug. Als
              gegevens niet rechtstreeks van jou komen, kan je rijschool
              toelichten uit welke bron zij komen.
            </p>
          </Section>

          <Section id="ontvangers" title="6. Ontvangers en leveranciers">
            <p>
              Alleen gebruikers met een passende rol en relevante relatie
              krijgen toegang. Afhankelijk van de configuratie kunnen daarnaast
              leveranciers gegevens verwerken voor de volgende functies:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Supabase</strong> voor authenticatie, database en
                beveiligde bestandsopslag;
              </li>
              <li>
                <strong>SendGrid</strong> voor transactionele e-mail wanneer
                e-mail is geconfigureerd;
              </li>
              <li>
                <strong>Mollie</strong> voor online betalingen wanneer een
                rijschool deze koppeling activeert;
              </li>
              <li>
                <strong>Google Maps Platform</strong> voor adres- of
                routefuncties wanneer een kaartenfunctie is geactiveerd;
              </li>
              <li>
                de pushdienst van je browser voor webpush wanneer je daar zelf
                toestemming voor geeft;
              </li>
              <li>
                <strong>OpenAI</strong> uitsluitend wanneer een bevoegde
                beheerder AI activeert en een gebruiker bewust een adviesfunctie
                start; AI staat standaard uit.
              </li>
            </ul>
            <p>
              NXTDRIVE deelt alleen wat voor de betreffende dienst nodig is,
              sluit waar vereist verwerkersafspraken en beoordeelt leveranciers
              en toegangsrechten. Gegevens kunnen ook worden verstrekt wanneer
              de wet dat verplicht of om een concreet beveiligingsincident of
              rechtsvordering te behandelen.
            </p>
          </Section>

          <Section id="internationaal" title="7. Verwerking buiten de EER">
            <p>
              Sommige leveranciers kunnen persoonsgegevens vanuit landen buiten
              de Europese Economische Ruimte verwerken. Waar geen
              adequaatheidsbesluit geldt, worden passende waarborgen gebruikt,
              zoals de standaardcontractbepalingen van de Europese Commissie,
              aangevuld met risicobeoordelingen en technische maatregelen waar
              nodig. Vraag via het privacycontact om informatie over de
              waarborgen die op jouw verwerking van toepassing zijn.
            </p>
          </Section>

          <Section id="bewaren" title="8. Hoe lang bewaren we gegevens?">
            <p>
              Persoonsgegevens worden niet langer bewaard dan nodig voor het
              doel waarvoor ze zijn verzameld. De termijn hangt af van de
              categorie, de status van je account en opleiding, afspraken met de
              rijschool, wettelijke bewaarplichten, mogelijke geschillen en
              beveiligingsnoodzaak.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Account- en dossiergegevens worden na beëindiging verwijderd of
                geanonimiseerd zodra ze niet meer nodig zijn en geen geldige
                bewaarplicht of legal hold geldt.
              </li>
              <li>
                Nederlandse basisgegevens uit een financiële administratie
                moeten doorgaans zeven jaar worden bewaard. Alleen gegevens die
                voor die administratie nodig zijn, blijven daarvoor behouden.
              </li>
              <li>
                Beveiligings- en auditgegevens worden beperkt tot de periode die
                nodig is om toegang te controleren, incidenten te onderzoeken en
                verantwoording af te leggen.
              </li>
              <li>
                Een privacy-export staat maximaal 24 uur klaar; iedere
                downloadlink is slechts 60 seconden geldig.
              </li>
            </ul>
            <p>
              NXTDRIVE ondersteunt versieerbare bewaarschema&apos;s, controle op
              wettelijke blokkades en gecontroleerde anonimisering. Een
              automatische verwijdering wordt niet uitgevoerd wanneer voor die
              categorie nog geen goedgekeurde regel bestaat; het record gaat dan
              naar handmatige beoordeling.
            </p>
          </Section>

          <Section id="beveiliging" title="9. Beveiliging">
            <p>
              NXTDRIVE gebruikt onder meer versleutelde HTTPS-verbindingen,
              tenant- en rolgebaseerde autorisatie, databasebeveiliging per
              rijschool, beperkte beheerrechten, auditregistratie, rate limits,
              secretbeheer, back-up- en herstelmaatregelen en
              beveiligingscontroles in het releaseproces.
            </p>
            <p>
              De Android-app vraagt alleen internettoegang, blokkeert
              cleartextverkeer en Android-back-ups en bewaart access- en
              refresh-tokens versleuteld met een niet-exporteerbare sleutel uit
              Android Keystore. Lokale sessiegegevens worden bij uitloggen
              verwijderd. Geen enkele beveiligingsmaatregel sluit ieder risico
              volledig uit. Meld een vermoeden van misbruik of een
              beveiligingslek via{" "}
              <a
                className="text-primary hover:underline"
                href="mailto:security@nxtdrive.io"
              >
                security@nxtdrive.io
              </a>
              .
            </p>
          </Section>

          <Section id="keuzes" title="10. Keuzes, notificaties en AI">
            <p>
              Webpush wordt pas geactiveerd nadat je browser daar toestemming
              voor heeft gegeven; je kunt die toestemming in je browser
              intrekken. Functionele sessieopslag is nodig om ingelogd te
              blijven en toegang te beveiligen.
            </p>
            <p>
              AI-functies staan standaard uit. Als een rijschool ze activeert,
              werken zij alleen na een bewuste gebruikersactie en leveren zij
              een concept of advies. NXTDRIVE laat AI niet zelfstandig een
              examenbesluit nemen, een leerling beoordelen of gegevens
              publiceren. Een bevoegde professional controleert en beslist.
              NXTDRIVE gebruikt leerling- of lesgegevens niet om een algemeen
              AI-model van NXTDRIVE te trainen.
            </p>
            <p>
              NXTDRIVE gebruikt geen persoonsgegevens voor
              advertentieprofilering en verkoopt geen persoonsgegevens.
            </p>
          </Section>

          <Section id="rechten" title="11. Jouw privacyrechten">
            <p>
              Afhankelijk van de situatie heb je recht op informatie, inzage,
              rectificatie, verwijdering, beperking, overdraagbaarheid en
              bezwaar. Je kunt ook toestemming intrekken en een klacht indienen.
              Er vindt via NXTDRIVE geen uitsluitend geautomatiseerde
              besluitvorming plaats die voor jou rechtsgevolgen of een
              vergelijkbaar aanmerkelijk gevolg heeft.
            </p>
            <p>
              Dien je verzoek bij voorkeur in bij de rijschool die jouw dossier
              beheert. Je kunt ook de{" "}
              <Link
                className="text-primary hover:underline"
                href="/account-verwijderen"
              >
                NXTDRIVE-privacyselfservice
              </Link>{" "}
              gebruiken of mailen naar{" "}
              <a
                className="text-primary hover:underline"
                href={`mailto:${privacyEmail}`}
              >
                {privacyEmail}
              </a>
              . We kunnen aanvullende informatie vragen om je identiteit veilig
              vast te stellen. Stuur nooit een wachtwoord en stuur niet
              ongevraagd een kopie van je identiteitsbewijs.
            </p>
            <p>
              Een verzoek wordt in beginsel binnen één maand beantwoord. Bij een
              complex verzoek of veel gelijktijdige verzoeken kan de wettelijke
              termijn met maximaal twee maanden worden verlengd; je krijgt dan
              binnen de eerste maand bericht met de reden. Rechten zijn niet
              absoluut: een wettelijke bewaarplicht, rechten van anderen of een
              concrete rechtsvordering kan een beperking rechtvaardigen.
            </p>
          </Section>

          <Section id="kinderen" title="12. Minderjarigen">
            <p>
              Rijleerlingen kunnen minderjarig zijn. De rijschool bepaalt welke
              gegevens nodig zijn voor de overeenkomst en wanneer een ouder of
              voogd moet worden betrokken. Gekoppelde ouders of voogden krijgen
              alleen de toegang die hun relatie en rol rechtvaardigen. NXTDRIVE
              is niet bedoeld om zonder noodzaak gegevens van kinderen te
              verzamelen of voor marketing aan kinderen.
            </p>
          </Section>

          <Section id="wijzigingen" title="13. Wijzigingen in dit beleid">
            <p>
              We passen dit beleid aan wanneer functies, leveranciers of
              wettelijke eisen veranderen. De datum en versie bovenaan worden
              dan bijgewerkt. Bij een materiële wijziging informeren we
              betrokken gebruikers via een passend kanaal. Een nieuwe tekst
              verandert de grondslag van al verzamelde gegevens niet met
              terugwerkende kracht.
            </p>
          </Section>

          <Section id="contact" title="14. Contact en klachten">
            <p>
              Neem voor dossierinhoud eerst contact op met je rijschool. Voor
              vragen over het platform, een verzoek of de identiteit en
              contactgegevens van de juridische aanbieder achter NXTDRIVE kun je
              mailen naar{" "}
              <a
                className="font-semibold text-primary hover:underline"
                href={`mailto:${privacyEmail}`}
              >
                {privacyEmail}
              </a>
              . Vermeld je account-e-mailadres, rol en rijschool, maar geen
              wachtwoord of gevoelige dossierinhoud.
            </p>
            <p>
              Ben je niet tevreden over de afhandeling, dan kun je een klacht
              indienen bij de toezichthouder in je woon- of werkland. In
              Nederland is dat de{" "}
              <a
                className="text-primary hover:underline"
                href="https://autoriteitpersoonsgegevens.nl/een-tip-of-klacht-indienen-bij-de-ap"
                rel="noreferrer"
                target="_blank"
              >
                Autoriteit Persoonsgegevens
              </a>
              . Je recht om naar de rechter te gaan blijft bestaan.
            </p>
          </Section>
        </article>
      </div>

      <footer className="flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
        <Link
          href="/account-verwijderen"
          className="font-semibold text-primary hover:underline"
        >
          Account en gegevens verwijderen
        </Link>
        <Link href="/beveiliging" className="text-primary hover:underline">
          Beveiliging
        </Link>
        <Link href="/" className="text-primary hover:underline">
          Terug naar start
        </Link>
      </footer>
    </main>
  );
}
