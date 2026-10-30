"use client";

import { useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";

export function ThemeSync() {
  const { settings, loaded } = useSettings();
  useEffect(() => {
    if (!loaded) return;
    const apply = () => {
      const dark = matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.theme = settings.theme === "system" ? (dark ? "dark" : "light") : settings.theme;
    };
    apply();
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [loaded, settings.theme]);
  return null;
}
