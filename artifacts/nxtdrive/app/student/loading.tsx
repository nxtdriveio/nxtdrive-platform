export default function StudentLoading() {
  return (
    <main className="min-h-dvh bg-[#050510] px-5 pb-28 pt-8 text-white">
      <div className="mx-auto flex w-full max-w-[29rem] flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="h-11 w-36 animate-pulse rounded-full bg-white/10" />
          <div className="flex gap-2">
            <div className="h-11 w-11 animate-pulse rounded-full bg-white/10" />
            <div className="h-11 w-11 animate-pulse rounded-full bg-white/10" />
          </div>
        </div>
        <div className="space-y-3 pt-8">
          <div className="h-10 w-3/4 animate-pulse rounded-2xl bg-white/10" />
          <div className="h-5 w-5/6 animate-pulse rounded-xl bg-white/8" />
        </div>
        <div className="h-80 animate-pulse rounded-[2rem] border border-white/10 bg-white/8" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-36 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/8" />
          <div className="h-36 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/8" />
        </div>
      </div>
    </main>
  );
}
