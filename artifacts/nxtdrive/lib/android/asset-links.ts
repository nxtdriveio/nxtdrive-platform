const SHA256_HEX_LENGTH = 64;

export type AndroidAssetLinkStatement = {
  relation: ["delegate_permission/common.handle_all_urls"];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
};

function formatFingerprint(hex: string): string {
  return hex.match(/.{2}/g)?.join(":") ?? "";
}

export function parseAndroidSigningFingerprints(
  value: string | undefined,
): string[] {
  if (!value) return [];

  const fingerprints = value
    .split(/[\s,;]+/)
    .map((entry) => entry.replaceAll(":", "").trim().toUpperCase())
    .filter(
      (entry) =>
        entry.length === SHA256_HEX_LENGTH && /^[0-9A-F]+$/.test(entry),
    )
    .map(formatFingerprint);

  return [...new Set(fingerprints)];
}

export function buildInstructorAssetLinks(
  fingerprints: string[],
): AndroidAssetLinkStatement[] {
  return buildAndroidAssetLinks("io.nxtdrive.instructeur", fingerprints);
}

export function buildAndroidAssetLinks(
  packageName: string,
  fingerprints: string[],
): AndroidAssetLinkStatement[] {
  if (fingerprints.length === 0) return [];

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
