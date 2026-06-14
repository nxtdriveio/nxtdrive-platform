export default function BackofficeLoading() {
  return (
    <main className="min-h-dvh bg-[#f6f7fb] p-4 text-slate-950 sm:p-6">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100dvh-3rem)] rounded-[1.5rem] bg-slate-950/5 lg:block" />
        <section className="space-y-4">
          <div className="h-16 animate-pulse rounded-[1.25rem] bg-slate-950/5" />
          <div className="h-44 animate-pulse rounded-[1.75rem] bg-slate-950/5" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="h-32 animate-pulse rounded-[1.25rem] bg-slate-950/5" />
            <div className="h-32 animate-pulse rounded-[1.25rem] bg-slate-950/5" />
            <div className="h-32 animate-pulse rounded-[1.25rem] bg-slate-950/5" />
          </div>
          <div className="h-80 animate-pulse rounded-[1.5rem] bg-slate-950/5" />
        </section>
      </div>
    </main>
  );
}
