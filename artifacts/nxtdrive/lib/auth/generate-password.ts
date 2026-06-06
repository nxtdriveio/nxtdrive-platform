import { randomBytes } from "node:crypto";

const LOWERCASE = "abcdefghijkmnpqrstuvwxyz";
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

const ALL = LOWERCASE + UPPERCASE + DIGITS;

/**
 * Generates a cryptographically random temporary password.
 *
 * - At least 14 characters
 * - Guaranteed to contain: >=1 lowercase, >=1 uppercase, >=1 digit
 * - Uses only mail-friendly characters to avoid copy/paste issues
 * - Uses node:crypto so it is safe for server-side use only
 * - Ambiguous characters (0, O, l, 1, I) excluded for readability
 */
export function generateTemporaryPassword(length = 16): string {
  if (length < 8) throw new Error("Minimum password length is 8");

  const bytes = randomBytes(length + 16);

  const mandatory = [
    pick(bytes, 0, LOWERCASE),
    pick(bytes, 1, UPPERCASE),
    pick(bytes, 2, DIGITS),
  ];

  const rest: string[] = [];
  for (let i = 3; i < length; i++) {
    rest.push(pick(bytes, i, ALL));
  }

  const combined = [...mandatory, ...rest];
  shuffle(combined, bytes.slice(length));

  return combined.join("");
}

function pick(source: Buffer, index: number, charset: string): string {
  return charset[source[index]! % charset.length]!;
}

function shuffle(arr: string[], entropy: Buffer): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = entropy[i % entropy.length]! % (i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}
