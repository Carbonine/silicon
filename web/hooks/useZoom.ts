"use client";

import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { KEYS } from "@/lib/storage";
import { withZoom, zoomOf, type ZoomMap } from "@/lib/zoom";

export function useZoom(url: string): [number, (z: number) => void] {
  const [map, setMap] = useLocalStorage<ZoomMap>(KEYS.zoom, {});
  const set = useCallback((z: number) => setMap((prev) => withZoom(prev, url, z)), [setMap, url]);
  return [zoomOf(map, url), set];
}
