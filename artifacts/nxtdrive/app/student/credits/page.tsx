import { redirect } from "next/navigation";

// Tegoed is samengevoegd met facturen in de Betalingen-tab. Oude links blijven
// werken via deze redirect.
export default function StudentCreditsRedirect() {
  redirect("/student/betalingen");
}
