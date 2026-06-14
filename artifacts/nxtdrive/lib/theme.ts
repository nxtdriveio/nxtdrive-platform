import { cookies } from "next/headers";
import { cache } from "react";

export type Theme = "light" | "dark";

export const THEME_COOKIE = "nxt_theme";
const DEFAULT_THEME: Theme = "dark";

export const getTheme = cache(async (): Promise<Theme> => {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return value === "light" || value === "dark" ? value : DEFAULT_THEME;
});
