export function examSignalDedupeKey(appointmentId: string, code: string): string {
  return `exam:${appointmentId}:${code}`;
}
