import { permanentRedirect } from "next/navigation";

export default function LegacyStudentAgendaPage() {
  permanentRedirect("/leerling/lessen");
}
