"use client";

import { useCallback, useEffect, useState } from "react";
import { readJson, writeJson } from "@/lib/storage";

/**
 * localStorage as React state. The first render uses `fallback` so the server and browser agree, then the
 * stored value arrives in an effect. `storage` events keep the shell and every silicon:// page in step.
 */
export function useLocalStorage<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setValue(readJson(key, fallback));
    setLoaded(true);
    const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) setValue(readJson(key, fallback)); };
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
    // `fallback` only matters as the initial value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    const resolved = typeof next === "function" ? (next as (prev: T) => T)(readJson(key, fallback)) : next;
    writeJson(key, resolved);
    setValue(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, set, loaded];
}
