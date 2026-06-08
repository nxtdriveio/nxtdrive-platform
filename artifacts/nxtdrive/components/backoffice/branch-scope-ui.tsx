import type * as React from "react";
import Link from "next/link";
import { Building2, Eye, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Branch } from "@/lib/branches/service";
import type { BranchAccessScope } from "@/lib/permissions";

export type BranchOption = Pick<Branch, "id" | "name">;

export function branchLabel(
  branchId: string | null | undefined,
  branchesById: Map<string, string>,
): string {
  if (!branchId) return "Alle vestigingen";
  return branchesById.get(branchId) ?? "Onbekende vestiging";
}

export function BranchScopeBadge({
  branchId,
  branchesById,
}: {
  branchId: string | null | undefined;
  branchesById: Map<string, string>;
}) {
  return (
    <Badge variant={branchId ? "outline" : "primary"}>
      {branchLabel(branchId, branchesById)}
    </Badge>
  );
}

export function BranchScopeSummary({
  scope,
  selectedBranchName,
  branchCount,
  sharedRowsLabel = "Gedeelde items blijven zichtbaar.",
  className,
}: {
  scope: BranchAccessScope;
  selectedBranchName?: string | null;
  branchCount: number;
  sharedRowsLabel?: string | null;
  className?: string;
}) {
  const scopedBranchCount =
    scope.scope_type === "branches" ? scope.branch_ids.length : branchCount;
  const title = selectedBranchName
    ? `Vestiging: ${selectedBranchName}`
    : scope.scope_type === "all"
      ? "Alle vestigingen"
      : "Alle toegestane vestigingen";
  const description = selectedBranchName
    ? "Je bekijkt alleen data van deze vestiging."
    : scope.scope_type === "all"
      ? `${branchCount} actieve vestiging${branchCount === 1 ? "" : "en"} beschikbaar binnen deze organisatie.`
      : `${scopedBranchCount} toegestane vestiging${scopedBranchCount === 1 ? "" : "en"} binnen jouw rol.`;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
        {title}
      </span>
      <span>{description}</span>
      {sharedRowsLabel ? <span>{sharedRowsLabel}</span> : null}
    </div>
  );
}

export function BranchFilterChips({
  branches,
  selectedBranchId,
  allHref,
  hrefForBranch,
  allLabel = "Alle toegestane vestigingen",
  className,
}: {
  branches: BranchOption[];
  selectedBranchId: string | null;
  allHref: string;
  hrefForBranch: (branchId: string) => string;
  allLabel?: string;
  className?: string;
}) {
  if (branches.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2 text-xs", className)}>
      <BranchChip href={allHref} active={selectedBranchId === null}>
        {allLabel}
      </BranchChip>
      {branches.map((branch) => (
        <BranchChip
          key={branch.id}
          href={hrefForBranch(branch.id)}
          active={selectedBranchId === branch.id}
        >
          {branch.name}
        </BranchChip>
      ))}
    </div>
  );
}

export function BranchChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 font-medium transition-colors",
        active
          ? "border-primary bg-primary-soft text-primary"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function BranchScopedEmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-10 text-center", className)}>
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Building2 className="h-5 w-5" aria-hidden />
      </div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </Card>
  );
}

export function ReadOnlyScopeNotice({
  title = "Alleen lezen",
  description = "Je rol geeft toegang om deze data te bekijken, maar niet om wijzigingen te maken binnen deze module.",
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <Eye className="mt-0.5 h-3.5 w-3.5 text-primary" aria-hidden />
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p>{description}</p>
      </div>
    </div>
  );
}
