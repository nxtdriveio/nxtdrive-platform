export function notificationDeduplicationKey(input: {
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  publicationVersion: number;
}) {
  if (
    [
      input.tenantId,
      input.eventType,
      input.aggregateType,
      input.aggregateId,
    ].some((value) => !value.trim()) ||
    !Number.isSafeInteger(input.publicationVersion) ||
    input.publicationVersion < 1
  ) {
    throw new Error("Ongeldige notificatie-deduplicatie-invoer.");
  }
  return [
    input.tenantId,
    input.eventType,
    input.aggregateType,
    input.aggregateId,
    input.publicationVersion,
  ].join(":");
}

export function safeLocationNotification(input: {
  eventType: "PICKUP_CHANGED" | "CONFIRM_PICKUP" | "DEPARTURE_ADVICE";
  published: boolean;
  recipientFirstName?: string | null;
}) {
  if (!input.published) return null;
  const greeting = input.recipientFirstName?.trim()
    ? `${input.recipientFirstName.trim()}, `
    : "";
  const body =
    input.eventType === "PICKUP_CHANGED"
      ? "je ophaalpunt is gewijzigd. Open NXTDrive voor de details."
      : input.eventType === "CONFIRM_PICKUP"
        ? "controleer en bevestig je ophaalpunt in NXTDrive."
        : "het is bijna tijd om te vertrekken. Open NXTDrive voor het vertrekadvies.";
  return `${greeting}${body}`;
}
