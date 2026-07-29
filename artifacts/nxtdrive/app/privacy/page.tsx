import Link from "next/link";

export const metadata = {
  title: "Privacybeleid — NXTDRIVE",
  description: "Hoe NXTDRIVE omgaat met je gegevens.",
};

/**
 * Public privacy policy page (Task #177). Required by the Google Play Console
 * (data safety form needs a privacy-policy URL) and linked from both PWAs.
 * Intentionally simple, public and statically renderable — no auth, no tenant.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-foreground">
      <h1 className="text-2xl font-semibold">Privacybeleid</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Laatst bijgewerkt: juni 2026
      </p>

      <section className="mt-6 space-y-4 text-sm leading-relaxed text-foreground">
        <p>
          NXTDRIVE is een platform voor rijscholen. Dit privacybeleid legt uit
          welke gegevens we verwerken wanneer je de NXTDRIVE Leerling- of
          Instructeur-app gebruikt, en waarom.
        </p>

        <h2 className="pt-2 text-lg font-semibold">Welke gegevens</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Accountgegevens: naam, e-mailadres en je rol bij de rijschool.</li>
          <li>
            Lesgegevens: geplande en afgeronde lessen, voortgang, tegoed en
            facturen.
          </li>
          <li>
            Communicatie: berichten tussen leerling en rijschool binnen de app.
          </li>
        </ul>

        <h2 className="pt-2 text-lg font-semibold">Waarvoor</h2>
        <p>
          Het platform verwerkt gegevens voor het plannen en uitvoeren van de
          rijopleiding, voortgang, communicatie en waar van toepassing
          betalingen. Toegang wordt beperkt op rol, tenant en relevante
          relatie. De eigenaar moet de definitieve doeleinden, grondslagen en
          verwerkers juridisch controleren.
        </p>

        <h2 className="pt-2 text-lg font-semibold">Bewaren en verwijderen</h2>
        <p>
          Bewaarregels zijn versieerbaar en ondersteunen preview, legal hold,
          anonimisering en audit. Onbekende termijnen blijven bewust leeg tot
          juridische goedkeuring. Je kunt een data-export of
          accountverwijdering aanvragen via de selfservice.
        </p>

        <h2 className="pt-2 text-lg font-semibold">Beveiliging</h2>
        <p>
          Toegang tot gegevens is rolgebaseerd en op database-niveau afgeschermd
          per rijschool. Alle verbindingen verlopen via HTTPS.
        </p>

        <h2 className="pt-2 text-lg font-semibold">Contact</h2>
        <p>
          Vragen over je gegevens? Neem contact op met je rijschool of mail naar
          privacy@nxtdrive.io.
        </p>
      </section>

      <div className="mt-8">
        <div className="flex flex-wrap gap-4 text-sm">
          <Link
            href="/account-verwijderen"
            className="text-primary hover:underline"
          >
            Accountverwijdering
          </Link>
          <Link href="/beveiliging" className="text-primary hover:underline">
            Beveiliging
          </Link>
          <Link href="/" className="text-primary hover:underline">
            Terug naar start
          </Link>
        </div>
      </div>
    </main>
  );
}
