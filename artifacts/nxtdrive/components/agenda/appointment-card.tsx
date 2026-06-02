import Link from "next/link";
import {
  APPOINTMENT_TYPE_ACCENT,
  APPOINTMENT_TYPE_LABEL,
  durationMinutes,
  isStudentLinkedType,
  type AgendaAppointmentType,
} from "@/lib/agenda/types";

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

// Compact agenda card for a generic appointment (examen/TTT/theorie of een
// tijd-bezettend blok). Visually distinguished per type via an accent class and
// links to its edit page. Block types occupy time but carry no student.
export function AppointmentCard({
  id,
  type,
  startsAt,
  endsAt,
  title,
  location,
  studentName,
  instructorName,
  href,
}: {
  id: string;
  type: AgendaAppointmentType;
  startsAt: string;
  endsAt: string;
  title?: string | null;
  location?: string | null;
  studentName?: string | null;
  instructorName?: string | null;
  href: string;
}) {
  const accent = APPOINTMENT_TYPE_ACCENT[type];
  const label = APPOINTMENT_TYPE_LABEL[type];
  const linked = isStudentLinkedType(type);
  const subtitle = linked
    ? (studentName ?? "Geen leerling")
    : (title?.trim() || `${durationMinutes(startsAt, endsAt)} min`);

  return (
    <Link
      key={id}
      href={href}
      className={`block rounded-md border border-dashed px-2 py-1.5 text-xs transition-colors hover:brightness-95 ${accent}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium text-foreground">
          {timeFmt.format(new Date(startsAt))}
        </span>
        <span className="font-medium">{label}</span>
      </div>
      <div className="mt-1 truncate text-muted-foreground">{subtitle}</div>
      {location ? (
        <div className="truncate text-[11px] text-muted-foreground">
          {location}
        </div>
      ) : null}
      {instructorName ? (
        <div className="truncate text-[11px] text-muted-foreground">
          {instructorName}
        </div>
      ) : null}
    </Link>
  );
}
