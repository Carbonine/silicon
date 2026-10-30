"use client";

import { useEffect, useRef } from "react";

/** "/" jumps to the page's search box, unless a dialog is open or the box already has focus. */
export function useSlashSearch() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== input.current && !document.querySelector("dialog[open]") && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  return input;
}
