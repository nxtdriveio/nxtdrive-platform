type SupabaseEnvConfig = {
  url: string;
  source: "SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_URL";
};

function normalizeHttpUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return trimmed.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function describeInvalidUrl(name: string, value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (normalizeHttpUrl(trimmed)) return null;
  return `${name} must be a http(s) Supabase API URL.`;
}

export function getServerSupabaseUrl(): SupabaseEnvConfig {
  const primary = normalizeHttpUrl(process.env["SUPABASE_URL"]);
  if (primary) {
    return { url: primary, source: "SUPABASE_URL" };
  }

  const publicFallback = normalizeHttpUrl(process.env["NEXT_PUBLIC_SUPABASE_URL"]);
  if (publicFallback) {
    return { url: publicFallback, source: "NEXT_PUBLIC_SUPABASE_URL" };
  }

  const invalid = [
    describeInvalidUrl("SUPABASE_URL", process.env["SUPABASE_URL"]),
    describeInvalidUrl(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env["NEXT_PUBLIC_SUPABASE_URL"],
    ),
  ].filter(Boolean);

  throw new Error(
    [
      "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL must be set to the Supabase API URL.",
      ...invalid,
    ].join(" "),
  );
}

export function getServerSupabaseAnonKey(): string {
  const anonKey =
    process.env["SUPABASE_ANON_KEY"] ??
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!anonKey) {
    throw new Error(
      "SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
    );
  }

  return anonKey;
}

export function getPublicSupabaseConfig(): { url: string; anonKey: string } {
  const url = normalizeHttpUrl(process.env["NEXT_PUBLIC_SUPABASE_URL"]);
  const anonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
    );
  }

  return { url, anonKey };
}
