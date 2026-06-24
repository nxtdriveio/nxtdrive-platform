import test from "node:test";
import assert from "node:assert/strict";
import { getServerSupabaseAnonKey, getServerSupabaseUrl } from "./env";

function withEnv(
  patch: Partial<NodeJS.ProcessEnv>,
  fn: () => void,
): void {
  const keys = [
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) {
      delete process.env[key];
    }
    Object.assign(process.env, patch);
    fn();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("server Supabase URL falls back to public API URL when SUPABASE_URL is not http", () => {
  withEnv(
    {
      SUPABASE_URL: "postgres://example.invalid:5432/postgres",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co/",
    },
    () => {
      const config = getServerSupabaseUrl();
      assert.equal(config.url, "https://example.supabase.co");
      assert.equal(config.source, "NEXT_PUBLIC_SUPABASE_URL");
    },
  );
});

test("server Supabase anon key falls back to public anon key", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-public",
    },
    () => {
      assert.equal(getServerSupabaseAnonKey(), "anon-public");
    },
  );
});
