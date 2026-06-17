export default function InstructorLoading() {
  return (
    <main className="min-h-dvh bg-[#050510] p-4 text-white sm:p-6">
      <div className="grid min-h-[calc(100dvh-2rem)] gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden rounded-[1.5rem] border border-white/10 bg-white/6 lg:block" />
        <section className="space-y-4">
          <div className="h-16 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/8" />
          <div className="h-36 animate-pulse rounded-[2rem] border border-white/10 bg-white/8" />
          <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr_1fr]">
            <div className="h-[28rem] animate-pulse rounded-[1.5rem] border border-white/10 bg-white/8" />
            <div className="space-y-4">
              <div className="h-48 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/8" />
              <div className="h-48 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/8" />
            </div>
            <div className="space-y-4">
              <div className="h-48 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/8" />
              <div className="h-48 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/8" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
