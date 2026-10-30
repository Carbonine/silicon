"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTabs } from "@/context/TabContext";
import { useZoom } from "@/hooks/useZoom";
import { bootEngine } from "@/lib/engine";
import { tabFrames } from "@/lib/frames";
import { attachWindow } from "@/lib/keys";
import { INTERNAL_GLYPHS, hostOf, internalToRoute, routeToInternal } from "@/lib/protocol";
import { loadSettings, recordVisit } from "@/lib/storage";
import type { ScramjetFrame, Tab } from "@/lib/types";

// The proxied document reports original URLs, so the native getter gives the address that loads through the proxy.
function pageIcon(doc: Document): string | null {
  try {
    const nativeHref = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, "href")!.get!;
    const link = doc.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (link) return nativeHref.call(link);
    const d = doc.createElement("link");
    d.setAttribute("href", "/favicon.ico");
    return nativeHref.call(d);
  } catch { return null; }
}

// The worker and the backend answer failures with a bare text page.
function proxyErrorText(doc: Document): string | null {
  try {
    if (!doc.body || doc.body.children.length > 1) return null;
    const t = (doc.body.innerText || "").trim();
    if (t.length > 4000) return null;
    if (/^Internal Service Worker Error:/i.test(t)) return t.replace(/^Internal Service Worker Error:\s*/i, "");
    if (/^Couldn't load this page through the proxy/i.test(t)) return "The proxy did not respond (service worker). Reload the tab, or check that the server is running.";
  } catch {}
  return null;
}

function TabFrame({ tab }: { tab: Tab }) {
  const { openTab, updateTab } = useTabs();
  const iframe = useRef<HTMLIFrameElement>(null);
  const frame = useRef<ScramjetFrame | null>(null);
  const loadedNonce = useRef(0);
  const urlRef = useRef(tab.url);
  urlRef.current = tab.url;
  const [zoom] = useZoom(tab.url);

  // This tab's own history. The browser's can't be used: all frames share one timeline, so going back in one
  // tab rewinds every other tab to that moment, which would reload a game running in the background.
  const history = useRef({ list: [] as string[], at: -1, sameLoad: false });
  const publishHistory = useCallback(() => {
    const h = history.current;
    updateTab(tab.id, { canGoBack: h.at > 0, canGoForward: h.at < h.list.length - 1 });
  }, [tab.id, updateTab]);
  const record = useCallback((url: string) => {
    const h = history.current;
    if (url === h.list[h.at]) return;
    if (url === h.list[h.at - 1]) h.at--; // the page went back by itself
    else if (url === h.list[h.at + 1]) h.at++;
    else if (h.sameLoad && h.at >= 0) h.list[h.at] = url; // a redirect: Back must not land on it again
    else { h.list = [...h.list.slice(0, h.at + 1), url]; h.at++; }
    h.sameLoad = true;
    publishHistory();
  }, [publishHistory]);

  const showError = useCallback((detail: string) => {
    const q = new URLSearchParams({ u: urlRef.current, d: detail }).toString();
    try { iframe.current!.contentWindow!.location.replace(`/silicon/error?${q}`); } catch { iframe.current!.src = `/silicon/error?${q}`; } // replace: Back skips the failed page
  }, []);

  const load = useCallback(async (url: string) => {
    const el = iframe.current!;
    if (url.startsWith("silicon://")) { el.src = internalToRoute(url) ?? "/silicon/newtab"; return; }
    try {
      const client = await bootEngine(loadSettings());
      frame.current ??= client.createFrame(el, (next) => { record(next); updateTab(tab.id, { url: next }); }, attachWindow, { onOpen: (next) => openTab(next, undefined, tab.id) });
      frame.current.go(url);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }, [openTab, record, showError, tab.id, updateTab]);

  useEffect(() => {
    const traverse = (delta: -1 | 1) => {
      const h = history.current, url = h.list[h.at + delta];
      if (url === undefined) return;
      h.at += delta;
      h.sameLoad = true;
      publishHistory();
      updateTab(tab.id, { url, isLoading: true });
      void load(url);
    };
    const reload = () => { updateTab(tab.id, { isLoading: true }); iframe.current?.contentWindow?.location.reload(); };
    tabFrames.set(tab.id, { iframe: iframe.current!, traverse, reload });
    return () => { tabFrames.delete(tab.id); };
  }, [load, publishHistory, tab.id, updateTab]);

  // Only an explicit navigation loads anything. The ref also covers React's double effects in development.
  useEffect(() => {
    if (loadedNonce.current === tab.nav.nonce) return;
    loadedNonce.current = tab.nav.nonce;
    history.current.sameLoad = false;
    record(tab.nav.target);
    void load(tab.nav.target);
  }, [load, record, tab.nav.nonce, tab.nav.target]);

  useEffect(() => { // never spin forever
    if (!tab.isLoading) return;
    const timer = setTimeout(() => updateTab(tab.id, { isLoading: false }), 30000);
    return () => clearTimeout(timer);
  }, [tab.id, tab.isLoading, updateTab]);

  const onLoad = () => {
    const win = iframe.current?.contentWindow;
    attachWindow(win); // silicon:// pages; proxied windows are covered by the frame plugin
    let doc: Document | null | undefined;
    try { doc = iframe.current?.contentDocument; } catch {}
    if (!doc || doc.documentURI === "about:blank") return;
    const internal = routeToInternal(doc.location.pathname, doc.location.search);
    if (internal) {
      const name = internal.slice(10).split(/[/?#]/)[0];
      const patch = { isLoading: false, favicon: null, glyph: INTERNAL_GLYPHS[name] ?? null, title: doc.title || name };
      if (name !== "error") record(internal);
      updateTab(tab.id, name === "error" ? patch : { ...patch, url: internal }); // the error page keeps the failed address
    } else {
      const err = proxyErrorText(doc);
      if (err !== null) { showError(err); return; }
      const icon = pageIcon(doc);
      updateTab(tab.id, { isLoading: false, glyph: null, favicon: icon, title: doc.title || hostOf(urlRef.current) });
      recordVisit(urlRef.current, doc.title);
      setTimeout(() => { // icons set by scripts
        if (iframe.current?.contentDocument !== doc) return;
        const later = pageIcon(doc);
        if (later && later !== icon) updateTab(tab.id, { favicon: later });
      }, 2000);
    }
    history.current.sameLoad = false;
  };

  // `hidden` is display:none: the frame stays in the document, so its page keeps its state in the background.
  // Zooming scales the frame and resizes it to match, so the page lays out as it would at that zoom and isn't touched.
  const zoomed = zoom === 1 ? undefined : { transformOrigin: "0 0", transform: `scale(${zoom})`, width: `${100 / zoom}%`, height: `${100 / zoom}%` };
  return <iframe ref={iframe} title={tab.title} onLoad={onLoad} style={zoomed} className={`h-full w-full border-0 bg-bg ${tab.isActive ? "block" : "hidden"}`} />;
}

export function TabViewport() {
  const { tabs } = useTabs();
  // Sorted by creation order, not strip order: moving an iframe in the DOM reloads it, which would end a game.
  const stable = [...tabs].sort((a, b) => a.seq - b.seq);
  return <main id="stage" className="overflow-hidden">{stable.map((tab) => <TabFrame key={tab.id} tab={tab} />)}</main>;
}
