import { permanentRedirect } from "next/navigation";

export default function LegacyStudentMessagesPage() {
  permanentRedirect("/leerling/berichten");
}
