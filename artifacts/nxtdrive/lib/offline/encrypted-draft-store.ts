"use client";

import type { OfflineLessonDraft } from "@/lib/offline/lesson-drafts";

const DATABASE = "nxtdrive-offline-drafts-v1";
const KEY_STORE = "keys";
const DRAFT_STORE = "drafts";
const KEY_ID = "lesson-drafts-aes-gcm";

type EncryptedRecord = {
  lessonId: string;
  iv: number[];
  ciphertext: ArrayBuffer;
  expiresAt: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE)) {
        database.createObjectStore(KEY_STORE);
      }
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE, { keyPath: "lessonId" });
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
  const read = database.transaction(KEY_STORE, "readonly").objectStore(KEY_STORE);
  const existing = (await requestResult(read.get(KEY_ID))) as
    | CryptoKey
    | undefined;
  if (existing) return existing;
  const generated = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const write = database
    .transaction(KEY_STORE, "readwrite")
    .objectStore(KEY_STORE);
  await requestResult(write.put(generated, KEY_ID));
  return generated;
}

export async function saveEncryptedLessonDraft(
  draft: OfflineLessonDraft,
): Promise<void> {
  const database = await openDatabase();
  try {
    const key = await encryptionKey(database);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(draft)),
    );
    const record: EncryptedRecord = {
      lessonId: draft.lessonId,
      iv: [...iv],
      ciphertext,
      expiresAt: draft.expiresAt,
    };
    const store = database
      .transaction(DRAFT_STORE, "readwrite")
      .objectStore(DRAFT_STORE);
    await requestResult(store.put(record));
  } finally {
    database.close();
  }
}

export async function loadEncryptedLessonDraft(
  lessonId: string,
): Promise<OfflineLessonDraft | null> {
  const database = await openDatabase();
  try {
    const store = database
      .transaction(DRAFT_STORE, "readonly")
      .objectStore(DRAFT_STORE);
    const record = (await requestResult(store.get(lessonId))) as
      | EncryptedRecord
      | undefined;
    if (!record) return null;
    if (Date.parse(record.expiresAt) <= Date.now()) {
      const remove = database
        .transaction(DRAFT_STORE, "readwrite")
        .objectStore(DRAFT_STORE);
      await requestResult(remove.delete(lessonId));
      return null;
    }
    const key = await encryptionKey(database);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(record.iv) },
      key,
      record.ciphertext,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as OfflineLessonDraft;
  } finally {
    database.close();
  }
}

export async function clearEncryptedLessonDrafts(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      [DRAFT_STORE, KEY_STORE],
      "readwrite",
    );
    await Promise.all([
      requestResult(transaction.objectStore(DRAFT_STORE).clear()),
      requestResult(transaction.objectStore(KEY_STORE).clear()),
    ]);
  } finally {
    database.close();
  }
}
