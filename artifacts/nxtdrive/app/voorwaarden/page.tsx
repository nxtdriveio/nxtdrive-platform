export const metadata = {
  title: "Voorwaarden — NXTDRIVE",
  description: "Status en contact voor de NXTDRIVE-gebruiksvoorwaarden.",
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-foreground">
      <p className="text-sm font-semibold text-warning">
        Juridische controle vereist
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Gebruiksvoorwaarden</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed">
        <p>
          De definitieve gebruiksvoorwaarden worden door de eigenaar en juridisch
          adviseur vastgesteld. NXTDRIVE vult geen contractuele bepalingen,
          bewaartermijnen of aansprakelijkheidsafspraken in zonder die
          goedkeuring.
        </p>
        <p>
          Vraag je rijschool om de voorwaarden die op jouw overeenkomst van
          toepassing zijn. Voor vragen over het platform kun je contact opnemen
          via support@nxtdrive.io.
        </p>
      </div>
    </main>
  );
}
