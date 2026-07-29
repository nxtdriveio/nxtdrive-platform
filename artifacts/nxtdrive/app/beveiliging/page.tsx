export const metadata = {
  title: "Beveiliging — NXTDRIVE",
  description: "Technische beveiligingsmaatregelen en meldroute van NXTDRIVE.",
};

export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-foreground">
      <h1 className="text-2xl font-semibold">Beveiliging</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        NXTDRIVE gebruikt tenantisolatie, rol- en vestigingscontrole, versleuteld
        transport, beperkte browsercapabilities, rate limiting, auditregistratie
        en tijdelijke ondertekende links voor privacyexports.
      </p>
      <section className="mt-7 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">Kwetsbaarheid melden</h2>
        <p>
          Meld een mogelijk beveiligingsprobleem verantwoord via
          security@nxtdrive.io. Vermeld de betrokken route, het tijdstip en een
          veilige reproductiebeschrijving. Stuur geen persoonsgegevens, tokens
          of productiecredentials mee.
        </p>
        <h2 className="pt-3 text-lg font-semibold">Operationele status</h2>
        <p>
          Live-, readiness- en versiecontroles zijn beschikbaar voor de
          beheeromgeving. Interne configuratie en foutdetails worden niet
          publiek gemaakt.
        </p>
      </section>
    </main>
  );
}
