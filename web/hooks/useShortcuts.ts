"use client";

import { useEffect, useRef } from "react";
import { onShellKey } from "@/lib/keys";
import type { Settings } from "@/lib/types";

export interface ShortcutActions {
  newTab(): void;
  closeTab(): void;
  reopenTab(): void;
  cycleTab(step: number): void;
  goToTab(n: number): void;
  traverse(delta: -1 | 1): void;
  focusAddress(): void;
  reload(): void;
  zoom(dir: 1 | -1 | 0): void;
  find(): void;
  toggleBookmark(): void;
  toggleBookmarksBar(): void;
  open(url: string): void;
  autoCover(): void;
  activeUrl(): string | undefined;
}

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn", "OS"]);

function tabShortcut(e: KeyboardEvent, a: ShortcutActions): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (e.ctrlKey && e.metaKey) return false;
  if (e.altKey && !mod) { // Alt (Option) versions
    if (e.shiftKey) { if (e.code !== "KeyT") return false; a.reopenTab(); return true; }
    if (e.code === "KeyT") { a.newTab(); return true; }
    if (e.code === "KeyW") { a.closeTab(); return true; }
    if (e.code === "BracketRight") { a.cycleTab(1); return true; }
    if (e.code === "BracketLeft") { a.cycleTab(-1); return true; }
    const d = /^Digit([1-9])$/.exec(e.code);
    if (d) { a.goToTab(+d[1]); return true; }
    return false;
  }
  if (!mod || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (e.ctrlKey && e.key === "Tab") { a.cycleTab(e.shiftKey ? -1 : 1); return true; }
  if (e.shiftKey) { if (k !== "t") return false; a.reopenTab(); return true; }
  if (k === "t") { a.newTab(); return true; }
  if (k === "w") { a.closeTab(); return true; }
  if (/^[1-9]$/.test(e.key)) { a.goToTab(+e.key); return true; }
  return false;
}

/** Returns true when the key was a shortcut. Ctrl is the key on a Mac too; Cmd also works where the browser allows it. */
function handle(e: KeyboardEvent, a: ShortcutActions): boolean {
  const k = e.key.toLowerCase(), one = e.ctrlKey !== e.metaKey;
  if (!e.altKey && !e.shiftKey && e.ctrlKey && !e.metaKey && k === "h") { a.open("silicon://history"); return true; }
  if (!e.altKey && !e.shiftKey && one && k === "l") { a.focusAddress(); return true; } // Shift+R stays a hard refresh of Silicon
  if (!e.altKey && !e.shiftKey && one && k === "r") { a.reload(); return true; }
  if (!e.altKey && one) {
    const dir = e.key === "+" || e.key === "=" ? 1 : e.key === "-" || e.key === "_" ? -1 : e.key === "0" && !e.shiftKey ? 0 : null;
    if (dir !== null) { a.zoom(dir); return true; }
  }
  if (!e.altKey && !e.shiftKey && one && k === "f") { a.find(); return true; }
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    const t = e.target as HTMLElement | null;
    if (!(t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? ""))) { a.traverse(e.key === "ArrowLeft" ? -1 : 1); return true; } // in a field they move the cursor by a word
  }
  if (tabShortcut(e, a)) return true;
  if (e.shiftKey && !e.altKey && one && k === "b") { a.toggleBookmarksBar(); return true; }
  if (e.shiftKey && !e.altKey && one && k === "o") { a.open("silicon://bookmarks"); return true; }
  if (!e.altKey && !e.shiftKey && one && k === "d") { a.toggleBookmark(); return true; }
  return false;
}

export function useShortcuts(actions: ShortcutActions, settings: Settings, isCover: boolean): void {
  const latest = useRef({ actions, settings });
  latest.current = { actions, settings };
  const coverFired = useRef(false);

  useEffect(() => onShellKey((e) => {
    if (e.defaultPrevented || e.isComposing) return; // the panic key has already acted
    const { actions: a, settings: s } = latest.current;
    if (handle(e, a)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    // The first real key press on the front page. Mouse clicks and typing in Settings or on a site don't count.
    if (s.autoCover && !isCover && !coverFired.current && !MODIFIERS.has(e.key) && a.activeUrl() === "silicon://newtab") {
      coverFired.current = true;
      a.autoCover();
    }
  }), [isCover]);
}
