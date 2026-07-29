type LogLevel = "debug" | "info" | "warn" | "error";

export type ObservabilityContext = {
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  tenantId?: string;
  actorId?: string;
  operation?: string;
};

const SENSITIVE_KEY_RE =
  /authorization|cookie|password|secret|token|email|phone|birth|note|message|body/i;

function sanitize(
  value: unknown,
  seen = new WeakSet<object>(),
  key = "",
): unknown {
  if (SENSITIVE_KEY_RE.test(key)) return "[REDACTED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitize(entry, seen));
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([entryKey, entryValue]) => [
        entryKey,
        sanitize(entryValue, seen, entryKey),
      ]),
  );
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { type: "UnknownError", message: "Unknown failure" };
  }
  return {
    type: error.name,
    message: error.message.slice(0, 500),
    stack:
      process.env["NODE_ENV"] === "production"
        ? undefined
        : error.stack?.slice(0, 4000),
  };
}

export function createTraceContext(
  correlationId: string,
): Required<Pick<ObservabilityContext, "correlationId" | "traceId" | "spanId">> {
  const traceId = crypto.randomUUID().replaceAll("-", "");
  const spanId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  return { correlationId, traceId, spanId };
}

async function exportOtlp(record: Record<string, unknown>): Promise<void> {
  const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]?.replace(/\/$/, "");
  if (!endpoint) return;
  const configuredHeaders = process.env["OTEL_EXPORTER_OTLP_HEADERS"];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (configuredHeaders) {
    for (const pair of configuredHeaders.split(",")) {
      const [name, ...value] = pair.split("=");
      if (name && value.length) headers[name.trim()] = value.join("=").trim();
    }
  }
  await fetch(`${endpoint}/v1/logs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      resourceLogs: [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: {
                  stringValue:
                    process.env["OTEL_SERVICE_NAME"] ?? "nxtdrive-web",
                },
              },
            ],
          },
          scopeLogs: [{ scope: { name: "nxtdrive" }, logRecords: [record] }],
        },
      ],
    }),
    signal: AbortSignal.timeout(2_000),
  });
}

export function logEvent(
  level: LogLevel,
  event: string,
  context: ObservabilityContext,
  attributes: Record<string, unknown> = {},
): void {
  const now = new Date();
  const record = {
    timestamp: now.toISOString(),
    observedTimeUnixNano: String(BigInt(now.getTime()) * 1_000_000n),
    severityText: level.toUpperCase(),
    event,
    context: sanitize(context),
    attributes: sanitize(attributes),
  };
  const output = JSON.stringify(record);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.info(output);

  void exportOtlp(record).catch(() => {
    // Telemetry export is deliberately non-blocking; application errors remain
    // visible in structured stdout when an external collector is unavailable.
  });
}

export async function traced<T>(
  event: string,
  context: ObservabilityContext,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  logEvent("info", `${event}.started`, context);
  try {
    const result = await operation();
    logEvent("info", `${event}.completed`, context, {
      durationMs: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (error) {
    logEvent("error", `${event}.failed`, context, {
      durationMs: Math.round(performance.now() - startedAt),
      error: serializeError(error),
    });
    throw error;
  }
}
