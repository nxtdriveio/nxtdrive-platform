import { redirect } from "next/navigation";

export default async function StudentDocumentsPage() {
  redirect("/leerling/instellingen?tab=documenten");
}
