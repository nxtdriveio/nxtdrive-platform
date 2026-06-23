import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function InstructorMessagesAliasPage() {
  redirect("/instructor/berichten");
}
