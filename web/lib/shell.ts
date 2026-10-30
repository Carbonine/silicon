"use client";

import type { ShellBridge } from "./types";

/** The shell's API, for silicon:// pages running in a tab. Null if the page was opened on its own. */
export function shell(): ShellBridge | null {
  try { return window.parent !== window ? window.parent.silicon ?? null : null; } catch { return null; }
}
export function goTo(url: string): void {
  const s = shell();
  if (s) s.navigate(window, url);
  else location.href = `/?url=${encodeURIComponent(url)}`;
}
