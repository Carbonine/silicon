export interface Tab {
  id: string;
  title: string;
  /** What the tab shows: a silicon:// address or a web URL. Updated as the page navigates. */
  url: string;
  favicon: string | null;
  /** Material Symbols glyph, used for silicon:// pages in place of a favicon. */
  glyph: string | null;
  isActive: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Creation order. Frames render in this order, whatever the tab strip's order is. */
  seq: number;
  /** A requested navigation. Bumping `nonce` loads `target`; page-driven URL changes don't touch it. */
  nav: { target: string; nonce: number };
}

export interface SiliconGame {
  id: string;
  title: string;
  source?: string;
  url?: string;
  path?: string;
  thumb?: string;
  kind?: string;
  mode?: string;
  byline?: string;
  tags?: string[];
  top?: boolean;
}

export interface GameSourceInfo { label: string; count: number; error?: string; loading?: boolean }

export interface PanicKey { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }

export interface Settings {
  transport: "epoxy" | "libcurl";
  wisp: string;
  proxy: string;
  searchEngine: string;
  customSearch: string;
  theme: "dark" | "light" | "system";
  cloak: string;
  cloakIcon: string;
  cloakTitle: string;
  cloakAlways: boolean;
  panicEnabled: boolean;
  panicKey: PanicKey | null;
  panicUrl: string;
  autoCover: boolean;
  confirmLeave: boolean;
  proxyGames: boolean;
  saveHistory: boolean;
  showBookmarksBar: boolean;
}

export interface ScramjetFrame { go(url: string): void }

/** What silicon:// pages reach through window.parent.silicon. */
export interface ShellBridge {
  openTab(input: string): void;
  navigate(win: Window, input: string): void;
  retitle(win: Window): void;
  createGameFrame(iframe: HTMLIFrameElement): Promise<ScramjetFrame>;
  openCover(kind: "blank" | "blob"): boolean;
  setCapture(on: boolean): void;
}

declare global {
  interface Window { silicon?: ShellBridge }
}
