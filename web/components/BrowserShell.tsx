"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { BookmarkBar } from "./BookmarkBar";
import { BookmarkEditDialog } from "./BookmarkEditDialog";
import { FindBar, type FindHandle } from "./FindBar";
import { Menu, type MenuState } from "./Menu";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { TabViewport } from "./TabViewport";
import { NEW_TAB_URL, useTabs } from "@/context/TabContext";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useSettings } from "@/hooks/useSettings";
import { useShortcuts, type ShortcutActions } from "@/hooks/useShortcuts";
import { openCover, useStealth } from "@/hooks/useStealth";
import { useZoom } from "@/hooks/useZoom";
import { sameUrl, type Bookmark } from "@/lib/bookmarks";
import { bootEngine, updateIdentity, updateTransport } from "@/lib/engine";
import { tabFrames, tabIdOfWindow } from "@/lib/frames";
import { attachWindow, setKeyCapture } from "@/lib/keys";
import { hostOf, internalToRoute, toUrl } from "@/lib/protocol";
import { loadSettings } from "@/lib/storage";
import { buildSuggestions, type Suggestion } from "@/lib/suggest";
import type { Tab } from "@/lib/types";
import { zoomStep } from "@/lib/zoom";

const isWeb = (url: string | undefined) => /^https?:\/\//i.test(url ?? "");

// The tab's favicon as a small data URL, so a bookmark's icon needs nothing looked up later.
function tabIconData(id: string): string | undefined {
  try {
    const img = document.querySelector<HTMLImageElement>(`[data-id="${id}"] img.fav`);
    if (!img?.complete || !img.naturalWidth) return undefined;
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    c.getContext("2d")!.drawImage(img, 0, 0, 32, 32);
    return c.toDataURL("image/png");
  } catch { return undefined; }
}

function TabButton({ tab, index, dragFrom, showMenu, onReload, flash }: { tab: Tab; index: number; dragFrom: RefObject<number | null>; showMenu(m: MenuState): void; onReload(id: string): void; flash(m: string): void }) {
  const { tabs, closeTab, closeOtherTabs, closeTabsToRight, duplicateTab, hasClosedTabs, openTab, reopenClosedTab, reorderTabs, setActiveTab, updateTab } = useTabs();

  const context = (e: MouseEvent) => {
    e.preventDefault();
    showMenu({ at: { x: e.clientX, y: e.clientY }, items: [
      { icon: "add", label: "New tab", run: () => openTab(NEW_TAB_URL, undefined, index + 1) },
      { icon: "refresh", label: "Reload", run: () => { setActiveTab(tab.id); onReload(tab.id); } },
      { icon: "content_copy", label: "Duplicate", run: () => duplicateTab(tab.id) },
      ...(hasClosedTabs() ? ["-" as const, { icon: "history", label: "Reopen closed tab", hint: "Ctrl+Shift+T", run: () => { if (!reopenClosedTab()) flash("No recently closed tabs"); } }] : []),
      "-",
      { icon: "close", label: "Close", run: () => closeTab(tab.id) },
      ...(tabs.length > 1 ? [{ icon: "tab_close_right", label: "Close other tabs", run: () => closeOtherTabs(tab.id) }] : []),
      ...(index < tabs.length - 1 ? [{ icon: "arrow_forward", label: "Close tabs to the right", run: () => closeTabsToRight(tab.id) }] : []),
    ] });
  };
  // The dragged tab moves along the strip as the pointer passes the middle of the others.
  const dragOver = (e: DragEvent<HTMLElement>) => {
    if (dragFrom.current === null) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect(), before = e.clientX < r.left + r.width / 2;
    const to = dragFrom.current < index ? (before ? index - 1 : index) : before ? index : index + 1;
    if (to !== dragFrom.current) { reorderTabs(dragFrom.current, to); dragFrom.current = to; }
  };

  return (
    <button
      role="tab" aria-selected={tab.isActive} data-id={tab.id} draggable title={tab.title}
      className={`tab${tab.isActive ? " active" : ""}${tab.isLoading ? " loading" : ""}${!tab.favicon && !tab.glyph ? " no-icon" : ""}`}
      onClick={() => setActiveTab(tab.id)} onContextMenu={context}
      onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } }}
      onDragStart={(e) => { dragFrom.current = index; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", tab.id); e.currentTarget.classList.add("dragging"); }}
      onDragOver={dragOver} onDrop={(e) => e.preventDefault()}
      onDragEnd={(e) => { dragFrom.current = null; e.currentTarget.classList.remove("dragging"); }}
    >
      <span className="tab-inner">
        {tab.favicon ? <img className="fav" alt="" src={tab.favicon} onError={() => updateTab(tab.id, { favicon: null, glyph: "public" })} /> : <span className="ms tab-icon">{tab.glyph ?? "public"}</span>}
        <span className="spinner" />
        <span className="title">{tab.title}</span>
        <span className="ms close" role="button" aria-label={`Close ${tab.title}`} onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}>close</span>
      </span>
    </button>
  );
}

function TabStrip({ showMenu, onReload, flash }: { showMenu(m: MenuState): void; onReload(id: string): void; flash(m: string): void }) {
  const { tabs, activeTab, openTab } = useTabs();
  const dragFrom = useRef<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  // Scrolls the strip only; scrollIntoView can nudge the whole page.
  useEffect(() => {
    const s = strip.current, b = s?.querySelector<HTMLElement>(".tab.active");
    if (!s || !b) return;
    if (b.offsetLeft < s.scrollLeft) s.scrollLeft = b.offsetLeft;
    else if (b.offsetLeft + b.offsetWidth > s.scrollLeft + s.clientWidth) s.scrollLeft = b.offsetLeft + b.offsetWidth - s.clientWidth;
  }, [activeTab?.id, tabs.length]);
  return (
    <header id="tabbar">
      <div ref={strip} id="tabs" role="tablist">{tabs.map((tab, i) => <TabButton key={tab.id} tab={tab} index={i} dragFrom={dragFrom} showMenu={showMenu} onReload={onReload} flash={flash} />)}</div>
      <button id="new-tab" className="icon-btn" aria-label="New tab" title="New tab" onClick={() => openTab()}><span className="ms">add</span></button>
    </header>
  );
}

function Toolbar({ addressRef, onMenu, toggleBookmark, onReload, flash }: { addressRef: RefObject<HTMLInputElement | null>; onMenu(rect: DOMRect): void; toggleBookmark(): void; onReload(id: string): void; flash(m: string): void }) {
  const { activeTab, navigateTab, updateTab } = useTabs();
  const { settings } = useSettings();
  const [bookmarks] = useBookmarks();
  const [draft, setDraft] = useState<string | null>(null); // null: show the tab's address
  const [items, setItems] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState(-1);
  const url = activeTab?.url ?? "";
  const [zoom, setZoom] = useZoom(url);
  const shown = url === NEW_TAB_URL ? "" : url;
  const handle = () => (activeTab ? tabFrames.get(activeTab.id) : undefined);
  const marked = isWeb(url) && bookmarks.some((b) => sameUrl(b.url, url));

  const closeSuggestions = () => { setItems([]); setSelected(-1); };
  useEffect(closeSuggestions, [activeTab?.id]);

  const go = (input: string) => {
    if (!activeTab) return;
    const target = toUrl(input, settings);
    setDraft(null);
    closeSuggestions();
    addressRef.current?.blur();
    if (target.startsWith("silicon://") && !internalToRoute(target)) { flash(`Unknown page: ${target}`); return; }
    navigateTab(activeTab.id, target);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const chosen = items[selected];
    if (chosen) { go(chosen.search ? chosen.main : chosen.url!); return; }
    closeSuggestions();
    if ((draft ?? shown).trim()) go(draft ?? shown);
  };
  const keys = (e: KeyboardEvent) => {
    if (!items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = items.length + 1; // -1 means "what you typed"
      setSelected(((selected + 1 + (e.key === "ArrowDown" ? 1 : -1)) % n + n) % n - 1);
    } else if (e.key === "Escape") closeSuggestions();
  };
  const reload = () => {
    if (!activeTab) return;
    if (activeTab.isLoading) { try { handle()?.iframe.contentWindow?.stop(); } catch {} updateTab(activeTab.id, { isLoading: false }); }
    else onReload(activeTab.id);
  };

  return (
    <div id="toolbar">
      <button id="back" className="icon-btn" aria-label="Back" title="Back" disabled={!activeTab?.canGoBack} onClick={() => handle()?.traverse(-1)}><span className="ms">arrow_back</span></button>
      <button id="forward" className="icon-btn" aria-label="Forward" title="Forward" disabled={!activeTab?.canGoForward} onClick={() => handle()?.traverse(1)}><span className="ms">arrow_forward</span></button>
      <button id="reload" className="icon-btn" aria-label={activeTab?.isLoading ? "Stop loading" : "Reload"} title={activeTab?.isLoading ? "Stop loading" : "Reload"} onClick={reload}><span className="ms">{activeTab?.isLoading ? "close" : "refresh"}</span></button>
      <button id="home-btn" className="icon-btn" aria-label="Home" title="Home" onClick={() => activeTab && navigateTab(activeTab.id, NEW_TAB_URL)}><span className="ms">home</span></button>
      <form id="address-form" onSubmit={submit}>
        <span id="site-icon" className="ms">{url === NEW_TAB_URL ? "search" : url.startsWith("silicon://") ? "info" : url.startsWith("https:") ? "lock" : "lock_open"}</span>
        <input
          ref={addressRef} id="address" className="address" type="text" placeholder="Search or enter web address" aria-label="Address bar" spellCheck={false} autoComplete="off"
          value={draft ?? shown}
          onChange={(e) => { setDraft(e.target.value); setItems(buildSuggestions(e.target.value, settings)); setSelected(-1); }}
          onKeyDown={keys} onFocus={(e) => e.target.select()}
          onBlur={() => setTimeout(() => { setDraft(null); closeSuggestions(); }, 100)}
        />
        <button type="button" id="zoom-chip" title="Reset zoom" hidden={zoom === 1} onClick={() => setZoom(1)}><span className="ms">zoom_in</span><span id="zoom-pct">{Math.round(zoom * 100)}%</span></button>
        <div id="suggest" role="listbox" hidden={!items.length}>
          {items.map((it, i) => (
            <div key={`${it.sub}${i}`} role="option" aria-selected={i === selected} className={`sg${i === selected ? " sel" : ""}`} onMouseDown={(e) => e.preventDefault() /* keep focus in the address bar */} onClick={() => go(it.search ? it.main : it.url!)}>
              {it.img ? <img className="sg-img" alt="" src={it.img} /> : <span className="ms sg-ico">{it.icon}</span>}
              <span className="sg-main">{it.main}</span>
              <span className="sg-sub">{it.sub}</span>
            </div>
          ))}
        </div>
      </form>
      <button id="bookmark-btn" className={`icon-btn${marked ? " on" : ""}`} aria-label="Bookmark this page" title={marked ? "Remove bookmark (Ctrl+D)" : "Bookmark this page (Ctrl+D)"} disabled={!isWeb(url)} onClick={toggleBookmark}><span className={`ms${marked ? " fill" : ""}`}>star</span></button>
      <button id="menu-btn" className="icon-btn" aria-label="More" aria-haspopup="menu" title="More" data-opens-menu onClick={(e) => onMenu(e.currentTarget.getBoundingClientRect())}><span className="ms">more_vert</span></button>
      <div id="loader" className={activeTab?.isLoading ? "on" : undefined} />
    </div>
  );
}

export function BrowserShell({ isCover }: { isCover: boolean }) {
  const { activeTab, closeTab, cycleTab, goToTab, navigateTab, openTab, reopenClosedTab, updateTab } = useTabs();
  const { settings, loaded, update } = useSettings();
  const [bookmarks, setBookmarks] = useBookmarks();
  useStealth(settings);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [status, setStatus] = useState("");
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const addressRef = useRef<HTMLInputElement>(null);
  const find = useRef<FindHandle>(null);
  const activeRef = useRef(activeTab);
  activeRef.current = activeTab;
  const activeId = activeTab?.id;
  const [zoom, setZoom] = useZoom(activeTab?.url ?? "");

  const closeMenu = useCallback(() => setMenu(null), []);
  const flash = useCallback((message: string) => {
    setStatus(message);
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(""), 4000);
  }, []);
  const reloadTab = useCallback((id: string) => tabFrames.get(id)?.reload(), []);
  const activeFrame = useCallback(() => (activeRef.current ? tabFrames.get(activeRef.current.id)?.iframe : undefined), []);
  const showMenu = useCallback((m: MenuState) => setMenu((cur) => (m.owner && cur?.owner === m.owner ? null : m)), []);
  const mainMenu = (rect: DOMRect) => showMenu({ owner: "main", at: rect, items: [
    { icon: "bookmarks", label: "Bookmarks", hint: "Ctrl+Shift+O", run: () => openTab("silicon://bookmarks") },
    { icon: "history", label: "History", hint: "Ctrl+H", run: () => openTab("silicon://history") },
    { icon: "settings", label: "Settings", run: () => openTab("silicon://settings") },
    "-",
    { icon: "keyboard", label: "Keyboard shortcuts", run: () => setShortcutsOpen(true) },
  ] });
  const toggleBookmark = () => {
    const tab = activeRef.current;
    if (!tab || !isWeb(tab.url)) return;
    if (bookmarks.some((b) => sameUrl(b.url, tab.url))) setBookmarks((l) => l.filter((b) => !sameUrl(b.url, tab.url)));
    else setBookmarks((l) => [...l, { title: tab.title || hostOf(tab.url), url: tab.url, icon: tabIconData(tab.id) }]);
  };
  const openBookmark = (b: Bookmark, newTab: boolean) => {
    if (newTab || !activeRef.current) openTab(b.url);
    else navigateTab(activeRef.current.id, b.url);
  };

  const actions = useMemo<ShortcutActions>(() => ({
    newTab: () => openTab(),
    closeTab: () => { if (activeRef.current) closeTab(activeRef.current.id); },
    reopenTab: () => { if (!reopenClosedTab()) flash("No recently closed tabs"); },
    cycleTab, goToTab,
    traverse: (delta) => { if (activeRef.current) tabFrames.get(activeRef.current.id)?.traverse(delta); },
    focusAddress: () => { addressRef.current?.focus(); addressRef.current?.select(); },
    reload: () => { if (activeRef.current) reloadTab(activeRef.current.id); },
    zoom: (dir) => setZoom(dir === 0 ? 1 : zoomStep(zoomRef.current, dir)),
    find: () => find.current?.open(),
    toggleBookmark: () => toggleRef.current(),
    toggleBookmarksBar: () => update({ showBookmarksBar: !loadSettings().showBookmarksBar }),
    open: (url) => openTab(url),
    autoCover: () => { if (!openCover(loadSettings(), "blank")) flash("Popup blocked. Allow popups for this site, then try again."); },
    activeUrl: () => activeRef.current?.url,
  }), [closeTab, cycleTab, flash, goToTab, openTab, reloadTab, reopenClosedTab, setZoom, update]);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const toggleRef = useRef(toggleBookmark);
  toggleRef.current = toggleBookmark;
  useShortcuts(actions, settings, isCover);

  // The API silicon:// pages use. Same name as the old shell's window.silicon.
  useEffect(() => {
    attachWindow(window);
    window.silicon = {
      openTab: (input) => { openTab(toUrl(input, loadSettings())); },
      navigate: (win, input) => { const id = tabIdOfWindow(win); if (id) navigateTab(id, toUrl(input, loadSettings())); },
      retitle: (win) => { const id = tabIdOfWindow(win); if (id) updateTab(id, { title: win.document.title }); },
      createGameFrame: async (iframe) => (await bootEngine(loadSettings())).createFrame(iframe, null, attachWindow, { fixHtml: true }),
      openCover: (kind) => openCover(loadSettings(), kind),
      setCapture: setKeyCapture,
      applyTransport: () => updateTransport(loadSettings()),
      reload: () => { window.onbeforeunload = null; location.reload(); }, // "confirm before leaving" must not block this
    };
    return () => { delete window.silicon; };
  }, [navigateTab, openTab, updateTab]);

  // Settings changed the connection: open tabs pick it up without being rebuilt.
  const { transport, wisp, proxy } = settings;
  useEffect(() => { if (loaded) void updateTransport(settings).catch(() => {}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loaded, transport, wisp, proxy]);

  const { userAgent, customUserAgent } = settings;
  useEffect(() => { if (loaded) void updateIdentity(settings).catch(() => {}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loaded, userAgent, customUserAgent]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TabStrip showMenu={showMenu} onReload={reloadTab} flash={flash} />
      <Toolbar addressRef={addressRef} onMenu={mainMenu} toggleBookmark={toggleBookmark} onReload={reloadTab} flash={flash} />
      <BookmarkBar show={settings.showBookmarksBar} onOpen={openBookmark} onEdit={setEditing} showMenu={showMenu} />
      <TabViewport />
      <FindBar ref={find} frame={activeFrame} tabKey={activeId} loading={!!activeTab?.isLoading} />
      {menu && <Menu menu={menu} onClose={closeMenu} />}
      <ShortcutsDialog open={shortcutsOpen} panic={settings.panicEnabled ? settings.panicKey : null} onClose={() => setShortcutsOpen(false)} />
      <BookmarkEditDialog bookmark={editing} onClose={() => setEditing(null)} />
      {status && <p className="status" role="status">{status}</p>}
    </div>
  );
}
