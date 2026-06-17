export default function StudentLoading() {
  return (
    <div
      className="min-w-0 space-y-5"
      aria-busy="true"
      aria-live="polite"
    >
      <section
        data-student-hero=""
        className="overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-brand-primary via-[#6d55ff] to-brand-secondary p-5 text-white shadow-brand-floating md:p-6"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74">
              Even laden
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              Je rijbewijsreis wordt klaargezet
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/78">
              We halen je lessen, voortgang en volgende stap op.
            </p>
          </div>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/24 bg-white/10 text-lg font-black shadow-sm">
            NX
          </div>
        </div>

        <div className="mt-6">
          <div className="h-2 overflow-hidden rounded-full bg-white/18">
            <div className="h-full w-2/3 rounded-full bg-white motion-safe:animate-pulse" />
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
            <span>Gegevens laden</span>
            <span>Bijna klaar</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          "Volgende les",
          "Voortgang",
          "Tegoed",
        ].map((label) => (
          <div
            key={label}
            className="rounded-[var(--radius-card)] border border-brand-border/80 bg-white/90 p-4 shadow-brand-card"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-brand-accent motion-safe:animate-pulse" />
              <div className="h-3 w-28 rounded-full bg-brand-muted" />
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-muted-foreground">
              {label}
            </p>
            <div className="mt-3 h-5 w-2/3 rounded-full bg-brand-muted motion-safe:animate-pulse" />
            <div className="mt-2 h-3 w-4/5 rounded-full bg-brand-muted" />
          </div>
        ))}
      </section>

      <section className="rounded-[var(--radius-card)] border border-brand-border/80 bg-white/90 p-4 shadow-brand-card md:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-muted-foreground">
              Mijn reis
            </p>
            <div className="mt-3 h-5 w-48 rounded-full bg-brand-muted motion-safe:animate-pulse" />
          </div>
          <div className="h-8 w-20 rounded-full bg-brand-accent" />
        </div>
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-brand-accent" />
              <div className="h-3 flex-1 rounded-full bg-brand-muted" />
              <div className="h-3 w-12 rounded-full bg-brand-muted" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
