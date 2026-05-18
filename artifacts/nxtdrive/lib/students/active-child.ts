import { cookies } from "next/headers";

const COOKIE = "nxt_active_child";

export async function getActiveChildId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

export async function setActiveChildId(studentId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, studentId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearActiveChild(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
