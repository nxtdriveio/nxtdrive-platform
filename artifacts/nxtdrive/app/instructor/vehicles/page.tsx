import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function InstructorVehiclesAliasPage() {
  redirect("/instructor/voertuigen");
}
