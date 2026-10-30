"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { TabViewport } from "./TabViewport";
import { NEW_TAB_URL, useTabs } from "@/context/TabContext";
import { useSettings } from "@/hooks/useSettings";
import { openCover, useStealth } from "@/hooks/useStealth";
import { bootEngine, updateTransport } from "@/lib/engine";
import { tabFrames, tabIdOfWindow } from "@/lib/frames";
import { attachWindow, setKeyCapture } from "@/lib/keys";
import { internalToRoute, toUrl } from "@/lib/protocol";
import { loadSettings } from "@/lib/storage";
import type { Tab } from "@/lib/types";

const iconButton = "grid size-8 shrink-0 place-items-center rounded-full text-icon hover:bg-hover disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent";

function TabButton({ tab, index, dragFrom }: { tab: Tab; index: number; dragFrom: React.RefObject<number | null> }) {
  const { closeTab, reorderTabs, setActiveTab } = useTabs();
  return (
    <div
      role="tab" aria-selected={tab.isActive} draggable title={tab.title}
      onClick={() => setActiveTab(tab.id)}
      onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } }}
      onDragStart={() => { dragFrom.current = index; }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => { if (dragFrom.current !== null) reorderTabs(dragFrom.current, index); dragFrom.current = null; }}
      className={`group flex h-8.5 min-w-11 max-w-55 flex-1 cursor-default items-center gap-2 rounded-lg px-2.5 text-[13px] select-none ${tab.isActive ? "bg-bg text-text shadow-(--tab-shadow)" : "text-muted hover:bg-hover"}`}
    >
      {tab.isLoading ? <span aria-label="Loading" className="size-4 shrink-0 animate-spin rounded-full border-2 border-muted border-t-accent" />
        : tab.favicon ? <img src={tab.favicon} alt="" className="size-4 shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        : tab.glyph ? <span className="ms shrink-0 text-base!">{tab.glyph}</span> : null}
      <span className="min-w-0 flex-1 truncate">{tab.title}</span>
      <button aria-label={`Close ${tab.title}`} onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }} className="grid size-5 shrink-0 place-items-center rounded-full hover:bg-press">
        <span className="ms text-sm!">close</span>
      </button>
    </div>
  );
}

function TabStrip() {
  const { tabs, openTab } = useTabs();
  const dragFrom = useRef<number | null>(null);
  return (
    <header className="flex items-center gap-1 bg-frame px-2 pt-1.5 pb-1">
      <div role="tablist" className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
        {tabs.map((tab, i) => <TabButton key={tab.id} tab={tab} index={i} dragFrom={dragFrom} />)}
      </div>
      <button aria-label="New tab" title="New tab" className={iconButton} onClick={() => openTab()}><span className="ms">add</span></button>
    </header>
  );
}

function AddressBar() {
  const { activeTab, navigateTab } = useTabs();
  const { settings } = useSettings();
  const [draft, setDraft] = useState<string | null>(null); // null: show the tab's address
  const [notice, setNotice] = useState("");
  const shown = activeTab?.url === NEW_TAB_URL ? "" : activeTab?.url ?? "";
  const handle = () => (activeTab ? tabFrames.get(activeTab.id) : undefined);
  const win = () => handle()?.iframe.contentWindow;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const input = (draft ?? shown).trim();
    if (!activeTab || !input) return;
    const url = toUrl(input, settings);
    setDraft(null);
    (document.activeElement as HTMLElement | null)?.blur();
    if (url.startsWith("silicon://") && !internalToRoute(url)) { setNotice(`Unknown page: ${url}`); setTimeout(() => setNotice(""), 3000); return; }
    navigateTab(activeTab.id, url);
  };
  const icon = !shown ? "search" : shown.startsWith("silicon://") ? "info" : shown.startsWith("https:") ? "lock" : "lock_open";

  return (
    <nav className="flex items-center gap-1 border-b border-border bg-bg px-2 py-1.5">
      <button aria-label="Back" title="Back" className={iconButton} disabled={!activeTab?.canGoBack} onClick={() => handle()?.traverse(-1)}><span className="ms">arrow_back</span></button>
      <button aria-label="Forward" title="Forward" className={iconButton} disabled={!activeTab?.canGoForward} onClick={() => handle()?.traverse(1)}><span className="ms">arrow_forward</span></button>
      <button aria-label={activeTab?.isLoading ? "Stop" : "Reload"} title={activeTab?.isLoading ? "Stop" : "Reload"} className={iconButton} onClick={() => { const w = win(); if (activeTab?.isLoading) w?.stop(); else w?.location.reload(); }}>
        <span className="ms">{activeTab?.isLoading ? "close" : "refresh"}</span>
      </button>
      <button aria-label="Home" title="Home" className={iconButton} onClick={() => activeTab && navigateTab(activeTab.id, NEW_TAB_URL)}><span className="ms">home</span></button>
      <form onSubmit={submit} className="relative flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-field px-3 focus-within:outline-2 focus-within:outline-accent">
        <span className="ms text-icon text-lg!">{icon}</span>
        <input
          aria-label="Address" placeholder="Search or enter address" spellCheck={false} autoComplete="off"
          value={draft ?? shown} onChange={(e) => setDraft(e.target.value)} onFocus={(e) => e.target.select()} onBlur={() => setDraft(null)}
          className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
        />
        {notice && <span role="status" className="shrink-0 text-xs text-muted">{notice}</span>}
      </form>
      <button aria-label="Settings" title="Settings" className={iconButton} onClick={() => activeTab && navigateTab(activeTab.id, "silicon://settings")}><span className="ms">settings</span></button>
    </nav>
  );
}

export function BrowserShell() {
  const { navigateTab, openTab, updateTab } = useTabs();
  const { settings, loaded } = useSettings();
  useStealth(settings);

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
    };
    return () => { delete window.silicon; };
  }, [navigateTab, openTab, updateTab]);

  // Settings changed the connection: open tabs pick it up without being rebuilt.
  const { transport, wisp, proxy } = settings;
  useEffect(() => { if (loaded) void updateTransport(settings).catch(() => {}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loaded, transport, wisp, proxy]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-frame">
      <TabStrip />
      <AddressBar />
      <TabViewport />
    </div>
  );
}
