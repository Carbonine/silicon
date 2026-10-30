"use client";

import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { DEFAULT_SETTINGS, KEYS } from "@/lib/storage";
import type { Settings } from "@/lib/types";

export function useSettings(): { settings: Settings; update(patch: Partial<Settings>): void; loaded: boolean } {
  const [stored, set, loaded] = useLocalStorage<Partial<Settings>>(KEYS.settings, {});
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...stored }), [stored]);
  const update = useCallback((patch: Partial<Settings>) => {
    set((prev) => ({ ...prev, ...patch }));
    if (patch.theme) { try { localStorage.setItem(KEYS.theme, patch.theme); } catch {} }
  }, [set]);
  return { settings, update, loaded };
}
