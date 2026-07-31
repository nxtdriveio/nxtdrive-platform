export default function StudentLoading() {
  return (
    <div
      className="flex min-h-[calc(100dvh-12rem)] min-w-0 items-center justify-center px-8 py-10"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Gegevens laden</span>
      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-brand-muted">
        <div className="h-full w-2/3 rounded-full bg-brand-primary motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
