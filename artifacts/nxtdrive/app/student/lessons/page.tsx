import { permanentRedirect } from "next/navigation";

export default function LegacyStudentLessonsPage() {
  permanentRedirect("/leerling/lessen");
}
