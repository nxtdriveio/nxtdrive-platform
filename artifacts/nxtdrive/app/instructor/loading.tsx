export default function InstructorLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center px-4 py-10">
      <section
        className="w-full max-w-[34rem] overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-brand-primary via-[#6d55ff] to-brand-secondary p-6 text-white shadow-brand-floating"
        aria-busy="true"
        aria-live="polite"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/72">
          Instructeursapp
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight">
          Cockpit wordt geladen
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/78">
          We zetten je planning, leerlingen en open taken klaar.
        </p>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/18">
          <div className="h-full w-2/3 rounded-full bg-white motion-safe:animate-pulse" />
        </div>
      </section>
    </div>
  );
}
