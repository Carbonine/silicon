"use client";

import type { ShellBridge } from "./types";

/** The shell's API, for silicon:// pages running in a tab. Null if the page was opened on its own. */
export function shell(): ShellBridge | null {
  try { return window.parent !== window ? window.parent.silicon ?? null : null; } catch { return null; }
}
/** Ctrl, Cmd or middle click opens a new tab, like a browser. */
export function openLink(url: string, e?: { metaKey: boolean; ctrlKey: boolean; button: number }): void {
  if (e && (e.metaKey || e.ctrlKey || e.button === 1)) shell()?.openTab(url);
  else goTo(url);
}
export function goTo(url: string): void {
  const s = shell();
  if (s) s.navigate(window, url);
  else location.href = `/?url=${encodeURIComponent(url)}`;
}
