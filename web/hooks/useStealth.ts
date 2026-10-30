"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onShellKey } from "@/lib/keys";
import { normalizeUrl } from "@/lib/protocol";
import type { PanicKey, Settings } from "@/lib/types";

// Each preset uses the real site's own favicon, loaded straight from that site.
export const CLOAKS: Record<string, { label: string; title?: string; icon?: string }> = {
  silicon: { label: "Off (Silicon)", title: "Silicon", icon: "/favicon.svg" },
  google: { label: "Google", title: "Google", icon: "https://www.google.com/favicon.ico" },
  wikipedia: { label: "Wikipedia", title: "Wikipedia", icon: "https://en.wikipedia.org/static/favicon/wikipedia.ico" },
  github: { label: "GitHub", title: "GitHub", icon: "https://github.com/favicon.ico" },
  khan: { label: "Khan Academy", title: "Khan Academy | Free Online Courses, Lessons & Practice", icon: "https://www.khanacademy.org/favicon.ico" },
  canvas: { label: "Canvas", title: "Dashboard", icon: "https://canvas.instructure.com/favicon.ico" },
  notion: { label: "Notion", title: "Notion", icon: "https://www.notion.so/images/favicon.ico" },
  quizlet: { label: "Quizlet", title: "Quizlet", icon: "https://quizlet.com/favicon.ico" },
  custom: { label: "Custom…" },
};

const PANIC_DEFAULT = "https://www.google.com/";
const REST = { title: "Silicon", icon: "/favicon.svg" };
const iconUrl = (s: string) => { try { const u = new URL(s.trim()); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch { return ""; } };

export function cloakIdentity(s: Settings, key = s.cloak): { title: string; icon: string } {
  if (key === "custom") {
    const icon = iconUrl(s.cloakIcon), title = s.cloakTitle.trim();
    return icon && title ? { title, icon } : REST; // custom needs both, or the tab keeps looking like Silicon
  }
  const c = CLOAKS[key];
  return c?.title && c.icon ? { title: c.title, icon: c.icon } : REST;
}

export function panicTarget(s: Settings): string {
  const u = normalizeUrl(s.panicUrl);
  return u && /^https?:/.test(u) ? u : PANIC_DEFAULT; // never silicon:// or javascript:
}

/** Leaves Silicon at once: the page is blanked first, so nothing stays visible while the navigation starts. */
export function goPanic(s: Settings): void {
  window.onbeforeunload = null; // "confirm before leaving" must never delay a panic
  try { document.documentElement.style.display = "none"; if (top !== self) top!.document.documentElement.style.display = "none"; } catch {}
  try { top!.location.replace(panicTarget(s)); } catch { location.replace(panicTarget(s)); }
}

const matchesKey = (e: KeyboardEvent, k: PanicKey) => e.key === k.key && !!e.ctrlKey === !!k.ctrl && !!e.altKey === !!k.alt && !!e.shiftKey === !!k.shift && !!e.metaKey === !!k.meta;
const IFRAME_ALLOW = "fullscreen; autoplay; clipboard-read; clipboard-write";

/** Opens Silicon inside an about:blank or blob: window, then sends this tab to the panic site. */
export function openCover(s: Settings, kind: "blank" | "blob"): boolean {
  const c = s.cloak === "silicon" ? cloakIdentity(s, "google") : cloakIdentity(s);
  const src = new URL("/", location.origin);
  src.searchParams.set("cover", "1");
  let w: Window | null;
  if (kind === "blob") {
    const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.title)}</title><link rel="icon" href="${esc(c.icon)}"><style>html,body{margin:0;height:100%;background:#2e3035}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe src="${esc(src.href)}" allow="${IFRAME_ALLOW}"></iframe></body></html>`;
    w = window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
  } else {
    // Built with DOM calls: document.write would change the window's URL to this site's address.
    w = window.open("about:blank", "_blank");
    if (w) {
      const d = w.document;
      d.title = c.title;
      const link = d.createElement("link"); link.rel = "icon"; link.href = c.icon; d.head.appendChild(link);
      d.documentElement.style.height = "100%";
      d.body.style.cssText = "margin:0;height:100%;background:#2e3035";
      const f = d.createElement("iframe");
      f.src = src.href; f.allow = IFRAME_ALLOW;
      f.style.cssText = "border:0;width:100%;height:100%;display:block";
      d.body.appendChild(f);
    }
  }
  if (!w) return false;
  goPanic(s);
  return true;
}

function setDocumentIdentity(c: { title: string; icon: string }) {
  document.title = c.title;
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
  link.href = c.icon;
}

/** Cloak, panic key, auto cover and the leave guard. Runs once, in the shell. */
export function useStealth(settings: Settings): { cloaked: boolean } {
  const [blurred, setBlurred] = useState(false);
  const latest = useRef(settings);
  latest.current = settings;

  useEffect(() => {
    // Focus moving into a tab's iframe also fires "blur", so only cloak when the whole document lost focus.
    const onBlur = () => setTimeout(() => { if (!document.hasFocus()) setBlurred(true); }, 0);
    const onFocus = () => setBlurred(false);
    const onVisibility = () => setBlurred(document.hidden);
    addEventListener("blur", onBlur);
    addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      removeEventListener("blur", onBlur);
      removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const cloaked = settings.cloakAlways || blurred;
  useEffect(() => { setDocumentIdentity(cloaked ? cloakIdentity(settings) : REST); }, [cloaked, settings]);

  const keyHandler = useCallback((e: KeyboardEvent) => {
    const s = latest.current;
    if (s.panicEnabled && s.panicKey && matchesKey(e, s.panicKey)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      goPanic(s);
    }
  }, []);
  useEffect(() => onShellKey(keyHandler), [keyHandler]);

  useEffect(() => {
    window.onbeforeunload = settings.confirmLeave ? (e) => { e.preventDefault(); e.returnValue = ""; return ""; } : null;
    return () => { window.onbeforeunload = null; };
  }, [settings.confirmLeave]);

  return { cloaked };
}
