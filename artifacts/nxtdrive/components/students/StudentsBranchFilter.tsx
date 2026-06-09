"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type BranchOption = {
  id: string;
  name: string;
};

export function StudentsBranchFilter({
  branchOptions,
  selectedBranchId,
}: {
  branchOptions: BranchOption[];
  selectedBranchId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  return (
    <select
      name="branch"
      value={selectedBranchId ?? ""}
      onChange={(event) => {
        const nextBranchId = event.target.value.trim();
        const params = new URLSearchParams(searchParams.toString());

        if (nextBranchId) {
          params.set("branch", nextBranchId);
        } else {
          params.delete("branch");
        }

        const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
        startTransition(() => {
          router.replace(nextUrl, { scroll: false });
        });
      }}
      disabled={isPending}
      className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70"
    >
      <option value="">Alle toegestane vestigingen</option>
      {branchOptions.map((branch) => (
        <option key={branch.id} value={branch.id}>
          {branch.name}
        </option>
      ))}
    </select>
  );
}
