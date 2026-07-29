import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildContentSecurityPolicy,
  normalizeCorrelationId,
  securityHeaders,
} from "@/lib/security/headers";

describe("application security headers", () => {
  it("uses a nonce without unsafe-eval and denies sensitive capabilities", () => {
    const headers = securityHeaders({
      nonce: "nonce-123",
      correlationId: "request-12345678",
      production: true,
      supabaseOrigin: "https://tenant.supabase.co/path",
    });

    assert.match(
      headers["Content-Security-Policy"] ?? "",
      /script-src 'self' 'nonce-nonce-123' 'strict-dynamic'/,
    );
    assert.doesNotMatch(
      headers["Content-Security-Policy"] ?? "",
      /unsafe-eval/,
    );
    assert.match(
      headers["Content-Security-Policy"] ?? "",
      /https:\/\/tenant\.supabase\.co/,
    );
    assert.match(headers["Permissions-Policy"] ?? "", /camera=\(\)/);
    assert.match(headers["Permissions-Policy"] ?? "", /microphone=\(\)/);
    assert.equal(
      headers["Strict-Transport-Security"],
      "max-age=31536000; includeSubDomains; preload",
    );
  });

  it("does not add HSTS outside production", () => {
    const headers = securityHeaders({
      nonce: "dev-nonce",
      correlationId: "request-12345678",
      production: false,
    });
    assert.equal(headers["Strict-Transport-Security"], undefined);
    assert.doesNotMatch(
      buildContentSecurityPolicy({
        nonce: "dev-nonce",
        production: false,
      }),
      /upgrade-insecure-requests/,
    );
  });

  it("only accepts bounded safe incoming correlation ids", () => {
    assert.equal(
      normalizeCorrelationId("request-12345678", () => "fallback-id"),
      "request-12345678",
    );
    assert.equal(
      normalizeCorrelationId("bad id\r\nx: injected", () => "fallback-id"),
      "fallback-id",
    );
  });
});
