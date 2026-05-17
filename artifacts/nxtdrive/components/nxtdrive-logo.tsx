import { cn } from "@/lib/utils";

export function NxtdriveLogo({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-2 font-bold tracking-tight", className)}>
      <span
        aria-hidden
        className="inline-block size-6 rounded-md bg-[color:var(--tenant-primary)]"
      />
      <span className="text-slate-900">NXTDRIVE</span>
    </div>
  );
}
