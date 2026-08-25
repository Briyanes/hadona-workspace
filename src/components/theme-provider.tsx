"use client";

import { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import { createClient } from "@/lib/supabase/client";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  isDark: false,
});

export const useTheme = () => useContext(ThemeContext);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const shouldDark = theme === "dark" || (theme === "system" && prefersDark);

  if (shouldDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [isDark, setIsDark] = useState(false);
  const supabase = createClient();

  // Race guard: true setelah user manual override via setTheme().
  // Mencegah loadTheme() yang lambat menimpa pilihan user dengan data DB lama.
  const userOverrideRef = useRef(false);
  // Ref sinkron agar listener mediaQuery tidak membaca stale closure `theme`.
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  // Apply theme on mount + listen to system changes
  useEffect(() => {
    // 1. Try localStorage first (instant, no flicker)
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored) {
      setThemeState(stored);
      applyTheme(stored);
    }

    // 2. Then load from DB
    const loadTheme = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("id", user.id)
        .single();
      const prefs = data as unknown as { preferences?: { theme?: Theme } };
      if (prefs?.preferences?.theme) {
        // Skip jika user sudah override manual (query ini mungkin stale)
        if (userOverrideRef.current) return;
        const dbTheme = prefs.preferences.theme;
        setThemeState(dbTheme);
        applyTheme(dbTheme);
        localStorage.setItem("theme", dbTheme);
      }
    };
    loadTheme();

    // 3. Listen to system preference changes (for "system" mode)
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (themeRef.current === "system") applyTheme("system");
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [supabase]);

  // Update isDark when theme changes
  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setIsDark(theme === "dark" || (theme === "system" && prefersDark));
  }, [theme]);

  const setTheme = useCallback(async (newTheme: Theme) => {
    userOverrideRef.current = true;
    setThemeState(newTheme);
    applyTheme(newTheme);
    localStorage.setItem("theme", newTheme);

    // Persist to DB
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: current } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("id", user.id)
        .single();
      const currentPrefs = (current as unknown as { preferences?: Record<string, unknown> })?.preferences || {};
      await supabase
        .from("profiles")
        .update({ preferences: { ...currentPrefs, theme: newTheme } } as never)
        .eq("id", user.id);
    }
  }, [supabase]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}