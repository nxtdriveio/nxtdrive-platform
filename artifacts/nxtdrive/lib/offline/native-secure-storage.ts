import { Capacitor, registerPlugin } from "@capacitor/core";

type SecureStoragePlugin = {
  set(options: { key: string; value: string }): Promise<void>;
  get(options: { key: string }): Promise<{ value: string | null }>;
  remove(options: { key: string }): Promise<void>;
  clear(): Promise<void>;
};

const nativeSecureStorage =
  registerPlugin<SecureStoragePlugin>("NxtSecureStorage");

export function hasNativeSecureStorage(): boolean {
  return Capacitor.isNativePlatform();
}

export async function setNativeSecureValue(
  key: string,
  value: string,
): Promise<void> {
  if (!hasNativeSecureStorage()) {
    throw new Error("Native secure storage is unavailable in this runtime.");
  }
  await nativeSecureStorage.set({ key, value });
}

export async function getNativeSecureValue(
  key: string,
): Promise<string | null> {
  if (!hasNativeSecureStorage()) return null;
  return (await nativeSecureStorage.get({ key })).value;
}

export async function removeNativeSecureValue(key: string): Promise<void> {
  if (!hasNativeSecureStorage()) return;
  await nativeSecureStorage.remove({ key });
}

/** Invoke on logout and after successful draft synchronization. */
export async function clearNativeSecureStorage(): Promise<void> {
  if (!hasNativeSecureStorage()) return;
  await nativeSecureStorage.clear();
}
