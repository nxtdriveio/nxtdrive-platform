const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return new TextDecoder("ascii").decode(bytes.slice(start, end));
}

export function hasExpectedDocumentSignature(
  bytes: Uint8Array,
  mimeType: string,
): boolean {
  if (mimeType === "application/pdf") return startsWith(bytes, PDF);
  if (mimeType === "image/png") return startsWith(bytes, PNG);
  if (mimeType === "image/jpeg") return startsWith(bytes, JPEG);
  if (mimeType === "image/webp") {
    return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  }
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    const brand = ascii(bytes, 4, 12);
    return /^ftyp(?:heic|heix|hevc|hevx|mif1|msf1)$/.test(brand);
  }
  return false;
}

const EICAR_FRAGMENT = "EICAR-STANDARD-ANTIVIRUS-TEST-FILE";

export type MalwareScanResult = "CLEAN" | "INFECTED" | "UNAVAILABLE";

export async function scanDocumentForMalware(
  bytes: Uint8Array,
): Promise<MalwareScanResult> {
  if (new TextDecoder().decode(bytes).includes(EICAR_FRAGMENT)) {
    return "INFECTED";
  }
  const endpoint = process.env["MALWARE_SCANNER_URL"];
  if (!endpoint) {
    return process.env["NODE_ENV"] === "production" ? "UNAVAILABLE" : "CLEAN";
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(process.env["MALWARE_SCANNER_TOKEN"]
          ? {
              Authorization: `Bearer ${process.env["MALWARE_SCANNER_TOKEN"]}`,
            }
          : {}),
      },
      body: new Blob([Uint8Array.from(bytes).buffer]),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return "UNAVAILABLE";
    const result = (await response.json()) as { clean?: boolean };
    return result.clean === true ? "CLEAN" : "INFECTED";
  } catch {
    return "UNAVAILABLE";
  }
}
