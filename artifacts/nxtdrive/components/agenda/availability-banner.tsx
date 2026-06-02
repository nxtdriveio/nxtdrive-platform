import { formatInterval, type Interval } from "@/lib/availability/types";

// Renders an instructor's free/available space for a day as a subtle background
// band on the agenda, distinct from booked appointments.
export function AvailabilityBanner({ intervals }: { intervals: Interval[] }) {
  if (!intervals || intervals.length === 0) return null;
  return (
    <div className="mb-2 rounded-md border border-dashed border-emerald-300 bg-emerald-50/70 px-2 py-1 text-[11px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
      <span className="font-medium">Beschikbaar</span>{" "}
      {intervals.map((iv) => formatInterval(iv)).join(", ")}
    </div>
  );
}
