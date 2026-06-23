import { supabase } from "@/integrations/supabase/client";
import { applyTheme, getSavedTheme, getTheme, saveTheme, GRUPMAR_THEME_STORAGE } from "@/lib/grupmarTheme";

export const GRUPMAR_USER_THEME_PREFIX = "grupmar_time_user_theme_v1_";
export const DEFAULT_USER_THEME_ID = "bizneo-gray";

export async function getCurrentThemeUserKey() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? data.user?.email ?? "anonymous";
}

export async function readUserThemeId() {
  if (typeof window === "undefined") return DEFAULT_USER_THEME_ID;

  const key = await getCurrentThemeUserKey();
  const userTheme = window.localStorage.getItem(`${GRUPMAR_USER_THEME_PREFIX}${key}`);
  const globalTheme = window.localStorage.getItem(GRUPMAR_THEME_STORAGE);

  return userTheme || globalTheme || DEFAULT_USER_THEME_ID;
}

export async function applySavedUserTheme() {
  const themeId = await readUserThemeId();
  return applyTheme(themeId || DEFAULT_USER_THEME_ID);
}

export async function saveUserTheme(themeId: string) {
  if (typeof window !== "undefined") {
    const key = await getCurrentThemeUserKey();
    window.localStorage.setItem(`${GRUPMAR_USER_THEME_PREFIX}${key}`, themeId);
    window.localStorage.setItem(GRUPMAR_THEME_STORAGE, themeId);
  }
  return saveTheme(themeId);
}

export function getDefaultTheme() {
  return getTheme(DEFAULT_USER_THEME_ID) ?? getSavedTheme();
}
