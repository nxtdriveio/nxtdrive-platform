"use client";

const DATABASE = "nxtdrive-offline-routes-v1";
const KEY_STORE = "keys";
const ROUTE_STORE = "routes";
const KEY_ID = "published-stops-aes-gcm";

export type OfflinePublishedStop = Readonly<{
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  label: string;
  formattedAddress: string;
  navigationUrl: string;
  status: "PLANNED" | "ON_MY_WAY" | "ARRIVED" | "DELAYED";
}>;

type EncryptedRoute = {
  tenantInstructorDay: string;
  iv: number[];
  ciphertext: ArrayBuffer;
  expiresAt: string;
  savedAt: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE)) {
        database.createObjectStore(KEY_STORE);
      }
      if (!database.objectStoreNames.contains(ROUTE_STORE)) {
        database.createObjectStore(ROUTE_STORE, {
          keyPath: "tenantInstructorDay",
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function encryptionKey(database: IDBDatabase): Promise<CryptoKey> {
  const existing = (await requestResult(
    database
      .transaction(KEY_STORE, "readonly")
      .objectStore(KEY_STORE)
      .get(KEY_ID),
  )) as CryptoKey | undefined;
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await requestResult(
    database
      .transaction(KEY_STORE, "readwrite")
      .objectStore(KEY_STORE)
      .put(key, KEY_ID),
  );
  return key;
}

export async function saveEncryptedPublishedStops(input: {
  key: string;
  stops: readonly OfflinePublishedStop[];
  expiresAt: string;
}): Promise<void> {
  const database = await openDatabase();
  try {
    const key = await encryptionKey(database);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(input.stops)),
    );
    await requestResult(
      database
        .transaction(ROUTE_STORE, "readwrite")
        .objectStore(ROUTE_STORE)
        .put({
          tenantInstructorDay: input.key,
          iv: [...iv],
          ciphertext,
          expiresAt: input.expiresAt,
          savedAt: new Date().toISOString(),
        } satisfies EncryptedRoute),
    );
  } finally {
    database.close();
  }
}

export async function loadEncryptedPublishedStops(keyValue: string): Promise<{
  stops: readonly OfflinePublishedStop[];
  savedAt: string;
} | null> {
  const database = await openDatabase();
  try {
    const record = (await requestResult(
      database
        .transaction(ROUTE_STORE, "readonly")
        .objectStore(ROUTE_STORE)
        .get(keyValue),
    )) as EncryptedRoute | undefined;
    if (!record) return null;
    if (Date.parse(record.expiresAt) <= Date.now()) {
      await requestResult(
        database
          .transaction(ROUTE_STORE, "readwrite")
          .objectStore(ROUTE_STORE)
          .delete(keyValue),
      );
      return null;
    }
    const key = await encryptionKey(database);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(record.iv) },
      key,
      record.ciphertext,
    );
    return {
      stops: JSON.parse(
        new TextDecoder().decode(plaintext),
      ) as OfflinePublishedStop[],
      savedAt: record.savedAt,
    };
  } finally {
    database.close();
  }
}

export async function clearEncryptedPublishedStops(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      [ROUTE_STORE, KEY_STORE],
      "readwrite",
    );
    await Promise.all([
      requestResult(transaction.objectStore(ROUTE_STORE).clear()),
      requestResult(transaction.objectStore(KEY_STORE).clear()),
    ]);
  } finally {
    database.close();
  }
}
