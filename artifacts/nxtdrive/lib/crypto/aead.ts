/**
 * AES-256-GCM authenticated encryption helpers, used to encrypt sensitive
 * per-tenant secrets (e.g. Mollie API keys) before they are written to the
 * database via the service role.
 *
 * The master key is read from MOLLIE_KEY_ENCRYPTION_SECRET (64 hex chars =
 * 32 bytes). The key is intentionally NOT shared with any client-side bundle.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function getMasterKey(): Buffer {
  const hex = process.env["MOLLIE_KEY_ENCRYPTION_SECRET"];
  if (!hex) {
    throw new Error(
      "MOLLIE_KEY_ENCRYPTION_SECRET is not set. Generate one with " +
        '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"`.',
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "MOLLIE_KEY_ENCRYPTION_SECRET must be a 64-character hex string (32 bytes).",
    );
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== KEY_BYTES) {
    throw new Error("MOLLIE_KEY_ENCRYPTION_SECRET decoded to wrong byte length.");
  }
  return buf;
}

export type EncryptedBlob = {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
};

export function encryptString(plaintext: string): EncryptedBlob {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptString requires a non-empty string");
  }
  const key = getMasterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptString(blob: EncryptedBlob): string {
  const key = getMasterKey();
  const iv = Buffer.from(blob.iv, "base64");
  const authTag = Buffer.from(blob.authTag, "base64");
  const ct = Buffer.from(blob.ciphertext, "base64");
  if (iv.length !== IV_BYTES) {
    throw new Error("Invalid IV length for AES-256-GCM");
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}

/**
 * Render a masked preview of a Mollie API key for the UI. Never exposes the
 * raw key beyond a fixed-length prefix and the last 4 characters.
 *   "test_abcdefghijklmnop"  →  "test_a••••••mnop"
 */
export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "••••••";
  const head = trimmed.slice(0, 6);
  const tail = trimmed.slice(-4);
  return `${head}••••••${tail}`;
}
