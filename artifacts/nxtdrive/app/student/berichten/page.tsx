import { permanentRedirect } from "next/navigation";

export default function LegacyStudentMessagesNlPage() {
  permanentRedirect("/leerling/berichten");
}
