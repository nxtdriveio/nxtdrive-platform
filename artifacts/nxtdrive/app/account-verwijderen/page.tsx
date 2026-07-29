import Link from "next/link";

import { PrivacyRequestControls } from "@/components/privacy/privacy-request-controls";
import { getCurrentUser } from "@/lib/auth/session";

const privacyEmail = "privacy@nxtdrive.io";
const deletionMailto =
  "mailto:privacy@nxtdrive.io?subject=Verzoek%20account-%20of%20gegevensverwijdering%20NXTDRIVE&body=Account-e-mailadres%3A%0ARol%20(leerling%2Fouder%2Finstructeur%2Fmedewerker)%3A%0ARijschool%3A%0AIk%20wil%20laten%20verwijderen%3A%0A%0AStuur%20geen%20wachtwoord%20of%20kopie%20van%20een%20identiteitsbewijs%20mee.";

export const metadata = {
  title: "Account en gegevens verwijderen — NXTDRIVE",
  description:
    "Vraag zonder app-installatie verwijdering van je NXTDRIVE-account en bijbehorende persoonsgegevens aan.",
};

export default async function AccountDeletionPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-foreground sm:px-6 sm:py-14">
      <header className="border-b border-border pb-8">
        <p className="text-sm font-semibold text-primary">
          NXTDRIVE-privacyselfservice
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Account en gegevens verwijderen
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Deze openbare pagina hoort bij NXTDRIVE Instructeur en de
          NXTDRIVE-webportalen. Je kunt hier een verwijderingsverzoek starten,
          ook als je de app niet meer hebt of niet meer kunt inloggen.
        </p>
      </header>

      <section className="mt-8 rounded-xl border border-primary/25 bg-primary/5 p-5">
        <h2 className="text-lg font-semibold">Start je verzoek</h2>
        {user ? (
          <div className="mt-3">
            <p className="mb-4 text-sm leading-6">
              Je bent ingelogd. Gebruik de beveiligde selfservice om het verzoek
              direct aan je account en rijschool te koppelen.
            </p>
            <PrivacyRequestControls allowDeletion />
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            <p className="text-sm leading-6">
              Stuur een e-mail met het e-mailadres van je account, je rol en de
              naam van je rijschool. Vermeld of je je hele account of alleen
              specifieke gegevens wilt laten verwijderen. We vragen zo nodig via
              een veilig kanaal om aanvullende verificatie.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={deletionMailto}
                className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                Verwijderingsverzoek e-mailen
              </a>
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold"
              >
                Inloggen voor selfservice
              </Link>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Geen e-mailprogramma beschikbaar? Schrijf naar{" "}
              <a
                className="text-primary hover:underline"
                href={`mailto:${privacyEmail}`}
              >
                {privacyEmail}
              </a>
              . Je hoeft de app niet opnieuw te installeren. Stuur nooit je
              wachtwoord en stuur niet ongevraagd een kopie van je
              identiteitsbewijs.
            </p>
          </div>
        )}
      </section>

      <div className="mt-10 space-y-10 text-sm leading-7">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Wat kun je aanvragen?</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>verwijdering van je inlogaccount en actieve sessies;</li>
            <li>
              verwijdering of anonimisering van direct identificerende
              profielgegevens;
            </li>
            <li>
              verwijdering van specifieke gegevens, zoals berichten of
              dossierbestanden, voor zover geen geldige reden bestaat om die te
              bewaren;
            </li>
            <li>
              beëindiging van optionele notificaties en bijbehorende
              abonnementgegevens.
            </li>
          </ul>
          <p>
            Wil je eerst weten welke gegevens aanwezig zijn? Vraag dan via de
            ingelogde selfservice een data-export aan of mail een inzageverzoek.
            Het ene verzoek is geen voorwaarde voor het andere.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Zo behandelen we je verzoek</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>We registreren het verzoek en stellen de reikwijdte vast.</li>
            <li>
              We controleren je identiteit op een manier die past bij het
              risico. We vragen niet meer informatie dan nodig.
            </li>
            <li>
              De verantwoordelijke rijschool beoordeelt dossiergegevens;
              NXTDRIVE ondersteunt en voert goedgekeurde technische stappen uit.
            </li>
            <li>
              We controleren wettelijke bewaarplichten, rechten van anderen,
              openstaande betalingen, fraude- of beveiligingsonderzoek en
              concrete rechtsvorderingen.
            </li>
            <li>
              Het account wordt verwijderd en gegevens worden gewist of
              onomkeerbaar geanonimiseerd waar dat kan en moet.
            </li>
            <li>
              Je krijgt bericht over de uitkomst en, als iets moet blijven
              staan, over de categorie en reden daarvan.
            </li>
          </ol>
          <p>
            We antwoorden in beginsel binnen één maand. Bij een complex verzoek
            kan de wettelijke termijn met maximaal twee maanden worden verlengd;
            je krijgt daarvan binnen de eerste maand bericht met de reden.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            Welke gegevens kunnen behouden blijven?
          </h2>
          <p>
            Verwijdering is niet absoluut. Factuur- en betaalgegevens kunnen
            bijvoorbeeld onder een fiscale bewaarplicht vallen; Nederlandse
            basisadministratie wordt doorgaans zeven jaar bewaard. Ook beperkt
            noodzakelijke auditinformatie kan blijven staan om een verwijdering
            aan te tonen, misbruik te voorkomen of een rechtsvordering te
            behandelen.
          </p>
          <p>
            Behouden gegevens worden afgeschermd, niet meer voor het gewone
            opleidingsproces gebruikt en verwijderd of verder geanonimiseerd
            zodra de geldige bewaartermijn of blokkade eindigt. De technische
            verwijderingsflow anonimiseert het leerlingprofiel, verwijdert
            directe contactgegevens en bewaart financiële en auditrecords alleen
            wanneer dat aantoonbaar nodig is.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Gevolgen van verwijderen</h2>
          <p>
            Na definitieve accountverwijdering kun je niet meer inloggen en kan
            herstel van verwijderde of geanonimiseerde gegevens onmogelijk zijn.
            Stem openstaande lessen, facturen of de overdracht van je dossier
            daarom zo nodig eerst af met de rijschool. Een rijschool mag je
            privacyverzoek niet gebruiken om wettelijke rechten te beperken.
          </p>
        </section>
      </div>

      <footer className="mt-10 flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
        <Link
          href="/privacy"
          className="font-semibold text-primary hover:underline"
        >
          Volledig privacybeleid
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
