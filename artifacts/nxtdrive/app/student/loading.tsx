export default function StudentLoading() {
  return (
    <div
      className="flex min-h-[calc(100dvh-12rem)] min-w-0 items-center justify-center py-10"
      aria-busy="true"
      aria-live="polite"
    >
      <section
        data-student-hero=""
        className="w-full max-w-[34rem] overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-brand-primary via-[#6d55ff] to-brand-secondary p-5 text-white shadow-brand-floating md:p-6"
      >
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74">
              Even laden
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight">
              We zetten alles klaar
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/78">
              We halen je lessen, voortgang en volgende stap op.
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/24 bg-white/10 text-sm font-black shadow-sm">
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
    </div>
  );
}
