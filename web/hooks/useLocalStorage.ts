"use client";

import { useCallback, useEffect, useState } from "react";
import { readJson, writeJson } from "@/lib/storage";

/**
 * localStorage as React state. The first render uses `fallback` so the server and browser agree, then the
 * stored value arrives in an effect. `storage` events reach the other pages; they never fire in the page that
 * wrote, so a same-window event keeps components within one page in step too.
 */
const LOCAL_EVENT = "silicon:storage";

export function useLocalStorage<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setValue(readJson(key, fallback));
    setLoaded(true);
    const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) setValue(readJson(key, fallback)); };
    const onLocal = (e: Event) => { if ((e as CustomEvent<string>).detail === key) setValue(readJson(key, fallback)); };
    addEventListener("storage", onStorage);
    addEventListener(LOCAL_EVENT, onLocal);
    return () => { removeEventListener("storage", onStorage); removeEventListener(LOCAL_EVENT, onLocal); };
    // `fallback` only matters as the initial value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    const resolved = typeof next === "function" ? (next as (prev: T) => T)(readJson(key, fallback)) : next;
    writeJson(key, resolved);
    dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: key }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, set, loaded];
}
