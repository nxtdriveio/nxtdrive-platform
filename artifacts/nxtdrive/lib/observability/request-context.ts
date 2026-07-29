import { headers } from "next/headers";

import {
  CORRELATION_ID_HEADER,
  normalizeCorrelationId,
} from "@/lib/security/headers";

export async function requestCorrelationId(): Promise<string> {
  const requestHeaders = await headers();
  return normalizeCorrelationId(
    requestHeaders.get(CORRELATION_ID_HEADER),
    () => crypto.randomUUID(),
  );
}
