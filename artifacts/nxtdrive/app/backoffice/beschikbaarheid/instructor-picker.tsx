"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import type { TenantInstructor } from "@/lib/availability/service";

export function InstructorPicker({
  instructors,
  selectedId,
}: {
  instructors: TenantInstructor[];
  selectedId: string | null;
}) {
  const router = useRouter();
  return (
    <Select
      aria-label="Kies instructeur"
      value={selectedId ?? ""}
      onChange={(e) =>
        router.push(`/backoffice/beschikbaarheid?instructor=${e.target.value}`)
      }
      className="max-w-sm"
    >
      {instructors.map((i) => (
        <option key={i.id} value={i.id}>
          {i.full_name}
        </option>
      ))}
    </Select>
  );
}
