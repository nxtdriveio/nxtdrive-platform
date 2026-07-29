import Link from "next/link";

import { PrivacyRequestControls } from "@/components/privacy/privacy-request-controls";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = {
  title: "Account verwijderen — NXTDRIVE",
  description: "Vraag verwijdering van je NXTDRIVE-account aan.",
};

export default async function AccountDeletionPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-foreground">
      <p className="text-sm font-semibold text-primary">Privacy selfservice</p>
      <h1 className="mt-2 text-2xl font-semibold">
        Accountverwijdering aanvragen
      </h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed">
        <p>
          Met een verwijderingsverzoek start je een gecontroleerd proces.
          NXTDRIVE controleert eerst of gegevens geanonimiseerd kunnen worden of
          door een geldige bewaarplicht of legal hold moeten worden behouden.
        </p>
        <p>
          Financiële en auditrecords worden niet stil via cascade verwijderd.
          Het voltooiingsrapport vermeldt welke directe identificatoren zijn
          verwijderd, welke gegevens zijn geanonimiseerd en welke records om een
          aantoonbare reden behouden zijn.
        </p>
      </div>

      <section className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Je verzoek</h2>
        {user ? (
          <div className="mt-3">
            <PrivacyRequestControls allowDeletion />
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-muted-foreground">
              Log in zodat het verzoek veilig aan je account en rijschool wordt
              gekoppeld.
            </p>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Inloggen
            </Link>
          </div>
        )}
      </section>

      <p className="mt-8 text-sm text-muted-foreground">
        Kun je niet inloggen? Neem contact op via privacy@nxtdrive.io. Deel geen
        medische, financiële of lesinhoudelijke gegevens per onbeveiligde e-mail.
      </p>
    </main>
  );
}
