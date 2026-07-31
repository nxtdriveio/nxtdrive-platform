import { redirect } from "next/navigation";

export default function LearnerReflectionPage() {
  redirect("/leerling/voortgang?tab=reflectie");
}
