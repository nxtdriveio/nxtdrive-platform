import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl =
  process.env.CAPACITOR_SERVER_URL ?? "https://nxtdrive.io/instructeur";

if (!serverUrl.startsWith("https://")) {
  throw new Error("CAPACITOR_SERVER_URL must use HTTPS");
}

const config: CapacitorConfig = {
  appId: "io.nxtdrive.instructeur",
  appName: "NXTDRIVE Instructeur",
  webDir: "public",
  server: {
    url: serverUrl,
    cleartext: false,
    androidScheme: "https",
    allowNavigation: ["nxtdrive.io", "*.nxtdrive.io"],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
