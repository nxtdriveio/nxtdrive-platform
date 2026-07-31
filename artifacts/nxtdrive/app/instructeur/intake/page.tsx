import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function InstructorIntakePage() {
  redirect("/instructeur/agenda");
}
