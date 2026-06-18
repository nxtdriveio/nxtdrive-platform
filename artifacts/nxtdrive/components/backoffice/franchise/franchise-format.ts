import type { FranchiseTone } from "@/components/backoffice/franchise/franchise-primitives";
import type { FranchiseAttentionPriority } from "@/lib/franchise/performance";

const euroFormatter = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const dateTimeFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatEuro(cents: number): string {
  return euroFormatter.format(cents / 100);
}

export function formatPercent(value: number | null): string {
  return value === null ? "-" : `${value}%`;
}

export function formatSignedPercent(value: number | null): string {
  if (value === null) return "geen trend";
  return `${value > 0 ? "+" : ""}${value}%`;
}

export function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return dateTimeFormatter.format(new Date(value));
}

export function priorityTone(priority: FranchiseAttentionPriority): FranchiseTone {
  if (priority === "hoog") return "danger";
  if (priority === "middel") return "warning";
  if (priority === "laag") return "info";
  return "success";
}

export function boolLabel(value: boolean): string {
  return value ? "Actief" : "Concept";
}
