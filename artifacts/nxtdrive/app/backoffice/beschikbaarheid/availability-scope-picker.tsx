"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import type { Branch } from "@/lib/branches/service";

export function AvailabilityScopePicker({
  branches,
  selectedBranchId,
  selectedInstructorId,
  allowOrganizationWide,
}: {
  branches: Pick<Branch, "id" | "name">[];
  selectedBranchId: string | null;
  selectedInstructorId: string | null;
  allowOrganizationWide: boolean;
}) {
  const router = useRouter();

  return (
    <Select
      aria-label="Kies beschikbaarheidsscope"
      value={selectedBranchId ?? ""}
      onChange={(event) => {
        const params = new URLSearchParams();
        if (selectedInstructorId) params.set("instructor", selectedInstructorId);
        if (event.target.value) params.set("branch", event.target.value);
        const query = params.toString();
        router.push(`/backoffice/beschikbaarheid${query ? `?${query}` : ""}`);
      }}
      className="max-w-sm"
    >
      {allowOrganizationWide ? (
        <option value="">Organisatiebreed</option>
      ) : null}
      {branches.map((branch) => (
        <option key={branch.id} value={branch.id}>
          {branch.name}
        </option>
      ))}
    </Select>
  );
}
