"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from "react";
import { INTERNAL_GLYPHS, hostOf } from "@/lib/protocol";
import type { Tab } from "@/lib/types";

export const NEW_TAB_URL = "silicon://newtab";

interface TabActions {
  /** `place` is a tab id to open next to, or a position in the strip. Otherwise the tab goes last. */
  openTab(url?: string, title?: string, place?: string | number): string;
  reopenClosedTab(): boolean;
  closeOtherTabs(id: string): void;
  closeTabsToRight(id: string): void;
  /** Moves `step` tabs along the strip, wrapping around. */
  cycleTab(step: number): void;
  /** 1 to 8 go to that tab, 9 to the last one. */
  goToTab(n: number): void;
  closeTab(id: string): void;
  setActiveTab(id: string): void;
  duplicateTab(id: string): string | null;
  reorderTabs(startIndex: number, endIndex: number): void;
  /** Loads a new address in a tab. */
  navigateTab(id: string, url: string): void;
  /** Records what a tab's page reports about itself. Never reloads the page. */
  updateTab(id: string, patch: Partial<Pick<Tab, "title" | "url" | "favicon" | "glyph" | "isLoading" | "canGoBack" | "canGoForward">>): void;
}
interface TabContextValue extends TabActions { tabs: Tab[]; activeTab: Tab | undefined; hasClosedTabs: () => boolean }

type Action =
  | { type: "open"; tab: Tab; at?: number }
  | { type: "close"; id: string; fallback: Tab }
  | { type: "activate"; id: string }
  | { type: "reorder"; from: number; to: number }
  | { type: "navigate"; id: string; url: string; nonce: number }
  | { type: "update"; id: string; patch: Partial<Tab> };

const activate = (tabs: Tab[], id: string): Tab[] => tabs.map((t) => (t.isActive === (t.id === id) ? t : { ...t, isActive: t.id === id }));
const internalName = (url: string): string | null => url.match(/^silicon:\/\/([^/?#]+)/i)?.[1].toLowerCase() ?? null;

function reducer(tabs: Tab[], a: Action): Tab[] {
  switch (a.type) {
    case "open": {
      const next = [...tabs];
      next.splice(a.at ?? next.length, 0, a.tab);
      return activate(next, a.tab.id);
    }
    case "close": {
      const i = tabs.findIndex((t) => t.id === a.id);
      if (i < 0) return tabs;
      const next = tabs.filter((t) => t.id !== a.id);
      if (!next.length) return [{ ...a.fallback, isActive: true }]; // closing the last tab leaves a new one
      return tabs[i].isActive ? activate(next, next[Math.min(i, next.length - 1)].id) : next;
    }
    case "activate": return activate(tabs, a.id);
    case "reorder": {
      if (a.from === a.to || !tabs[a.from] || a.to < 0 || a.to >= tabs.length) return tabs;
      const next = [...tabs];
      const [moved] = next.splice(a.from, 1);
      next.splice(a.to, 0, moved);
      return next;
    }
    case "navigate": return tabs.map((t) => (t.id === a.id ? { ...t, url: a.url, isLoading: true, nav: { target: a.url, nonce: a.nonce } } : t));
    case "update": return tabs.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t));
  }
}

const TabContext = createContext<TabContextValue | null>(null);

export function TabProvider({ children, initialUrl = NEW_TAB_URL }: { children: ReactNode; initialUrl?: string }) {
  const counter = useRef(1);
  const nonce = useRef(1);
  const make = useCallback((url: string, title?: string, id?: number): Tab => {
    const seq = id ?? ++counter.current, name = internalName(url);
    return {
      id: `tab-${seq}`, seq, url, title: title || (name ? (name === "newtab" ? "New Tab" : name) : hostOf(url)),
      favicon: null, glyph: name ? INTERNAL_GLYPHS[name] ?? null : null, isActive: false, isLoading: true,
      canGoBack: false, canGoForward: false, nav: { target: url, nonce: ++nonce.current },
    };
  }, []);

  const [tabs, dispatch] = useReducer(reducer, undefined, () => [{ ...make(initialUrl, undefined, 1), isActive: true }]);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const closed = useRef<{ url: string; at: number }[]>([]); // for "Reopen closed tab"; in memory only

  const actions = useMemo<TabActions>((): TabActions => {
    const actions: TabActions = {
    openTab(url = NEW_TAB_URL, title, place) {
      const tab = make(url, title);
      const i = typeof place === "string" ? tabsRef.current.findIndex((t) => t.id === place) : -1;
      dispatch({ type: "open", tab, at: typeof place === "number" ? place : i < 0 ? undefined : i + 1 });
      return tab.id;
    },
    closeTab(id) {
      const at = tabsRef.current.findIndex((t) => t.id === id);
      if (at >= 0 && tabsRef.current[at].url !== NEW_TAB_URL) {
        closed.current.push({ url: tabsRef.current[at].url, at });
        if (closed.current.length > 10) closed.current.shift();
      }
      dispatch({ type: "close", id, fallback: make(NEW_TAB_URL) });
    },
    reopenClosedTab() {
      const c = closed.current.pop();
      if (!c) return false;
      actions.openTab(c.url, undefined, Math.min(c.at, tabsRef.current.length));
      return true;
    },
    closeOtherTabs(id) {
      dispatch({ type: "activate", id });
      for (const t of tabsRef.current) if (t.id !== id) actions.closeTab(t.id);
    },
    closeTabsToRight(id) {
      const i = tabsRef.current.findIndex((t) => t.id === id), right = tabsRef.current.slice(i + 1);
      if (right.some((t) => t.isActive)) dispatch({ type: "activate", id });
      for (const t of right) actions.closeTab(t.id);
    },
    cycleTab(step) {
      const list = tabsRef.current, i = list.findIndex((t) => t.isActive);
      if (list.length > 1) dispatch({ type: "activate", id: list[(i + step + list.length) % list.length].id });
    },
    goToTab(n) {
      const list = tabsRef.current, tab = n === 9 ? list[list.length - 1] : list[n - 1];
      if (tab) dispatch({ type: "activate", id: tab.id });
    },
    setActiveTab(id) { dispatch({ type: "activate", id }); },
    duplicateTab(id) {
      const i = tabsRef.current.findIndex((t) => t.id === id);
      if (i < 0) return null;
      const tab = make(tabsRef.current[i].url, tabsRef.current[i].title);
      dispatch({ type: "open", tab, at: i + 1 });
      return tab.id;
    },
    reorderTabs(startIndex, endIndex) { dispatch({ type: "reorder", from: startIndex, to: endIndex }); },
    navigateTab(id, url) { dispatch({ type: "navigate", id, url, nonce: ++nonce.current }); },
    updateTab(id, patch) { dispatch({ type: "update", id, patch }); },
    };
    return actions;
  }, [make]);

  const value = useMemo(() => ({ ...actions, tabs, activeTab: tabs.find((t) => t.isActive), hasClosedTabs: () => closed.current.length > 0 }), [actions, tabs]);
  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
}

export function useTabs(): TabContextValue {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error("useTabs must be used inside <TabProvider>");
  return ctx;
}
