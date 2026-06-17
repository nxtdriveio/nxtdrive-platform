"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import type { TenantInstructor } from "@/lib/availability/service";

export function InstructorPicker({
  instructors,
  selectedId,
  selectedBranchId,
}: {
  instructors: TenantInstructor[];
  selectedId: string | null;
  selectedBranchId?: string | null;
}) {
  const router = useRouter();
  return (
    <Select
      aria-label="Kies instructeur"
      value={selectedId ?? ""}
      onChange={(e) =>
        router.push(
          `/backoffice/beschikbaarheid?instructor=${e.target.value}${
            selectedBranchId ? `&branch=${selectedBranchId}` : ""
          }`,
        )
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
