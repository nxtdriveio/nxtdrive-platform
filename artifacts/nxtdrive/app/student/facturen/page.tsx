import { redirect } from "next/navigation";

// Facturen zijn samengevoegd met tegoed in de Betalingen-tab. Oude links blijven
// werken via deze redirect; het factuurdetail (/student/facturen/[id]) blijft.
export default function StudentInvoicesRedirect() {
  redirect("/student/betalingen");
}
