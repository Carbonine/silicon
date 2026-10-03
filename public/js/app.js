import { init, setTransport, createFrame, defaultWisp } from "/js/proxy-client.js";

// The shell must only ever run as the top page. If a proxied redirect ever lands a frame on it,
// stop here instead of nesting another copy of the browser inside itself.
// The one exception is the about:blank / blob: cover window, which loads Silicon with ?cover=1.
const isCover = new URLSearchParams(location.search).get("cover") === "1";
if (self !== top && !isCover) { document.documentElement.replaceChildren(); throw new Error("Silicon shell loaded in a frame"); }

const $ = (id) => document.getElementById(id);
const stage = $("stage"), status = $("status"), address = $("address");
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const tabs = new Map(); // id -> { id, btn, page, iframe, frame, url }
let active = null, seq = 0, ready;

// Every tab is one iframe. silicon://NAME pages are real pages served at /silicon/NAME, so the
// iframe's own session history gives back/forward across internal pages and proxied sites alike.
const INTERNAL = new Set(["newtab", "games", "bookmarks", "history", "settings", "play"]);

// ---------- Settings (stored in localStorage, edited on silicon://settings) ----------
const ENGINES = {
  duckduckgo: { label: "DuckDuckGo", url: "https://html.duckduckgo.com/html/?q=%s" },
  google: { label: "Google", url: "https://www.google.com/search?q=%s" },
  bing: { label: "Bing", url: "https://www.bing.com/search?q=%s" },
  brave: { label: "Brave Search", url: "https://search.brave.com/search?q=%s" },
  startpage: { label: "Startpage", url: "https://www.startpage.com/do/search?q=%s" },
  ecosia: { label: "Ecosia", url: "https://www.ecosia.org/search?q=%s" },
  wikipedia: { label: "Wikipedia", url: "https://en.wikipedia.org/w/index.php?search=%s" },
  yandex: { label: "Yandex", url: "https://yandex.com/search/?text=%s" },
  custom: { label: "Custom…" }, // template from settings.customSearch, e.g. example.com/?q=%s
};
// Turns "example.com/?q=%s" into an https URL template, or null if it isn't usable.
function normalizeSearchTemplate(input) {
  input = (input || "").trim();
  if (!input.includes("%s")) return null;
  const t = /^https?:\/\//i.test(input) ? input : "https://" + input;
  try { const u = new URL(t.replace("%s", "test")); return /^https?:$/.test(u.protocol) ? t : null; } catch { return null; }
}
const THEMES = ["dark", "light", "system"];
const DEFAULTS = {
  transport: "epoxy", wisp: "", proxy: "", searchEngine: "duckduckgo",
  theme: THEMES.includes(store.get("theme")) ? store.get("theme") : "dark",
  cloak: store.get("cloak") || "silicon", cloakIcon: "", cloakTitle: "", cloakAlways: false,
  panicEnabled: false, panicKey: null, panicUrl: "https://www.google.com/", // key: { key, ctrl, alt, shift, meta }
  autoCover: false, confirmLeave: false, customSearch: "", proxyGames: true, saveHistory: true, showBookmarksBar: true,
};
const loadSettings = () => { try { return { ...DEFAULTS, ...JSON.parse(store.get("settings")) }; } catch { return { ...DEFAULTS }; } };
let settings = loadSettings();
async function updateSettings(patch) {
  const before = JSON.stringify([settings.transport, settings.wisp, settings.proxy]);
  settings = { ...settings, ...patch };
  store.set("settings", JSON.stringify(settings));
  if ("theme" in patch) applyTheme();
  if ("showBookmarksBar" in patch) renderBookmarkBar();
  applyLeaveGuard();
  refreshCloak();
  if (ready && JSON.stringify([settings.transport, settings.wisp, settings.proxy]) !== before) await setTransport(settings);
}

// ---------- Theme ----------
// localStorage "theme" holds the preference (dark | light | system); each page resolves it on load.
const dark = matchMedia("(prefers-color-scheme: dark)");
const resolvedTheme = () => (settings.theme === "system" ? (dark.matches ? "dark" : "light") : settings.theme);
function applyThemeTo(iframe, t) { try { iframe.contentDocument.documentElement.dataset.theme = t; } catch {} }
function applyTheme() {
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  store.set("theme", settings.theme);
  for (const tab of tabs.values()) applyThemeTo(tab.iframe, t);
}
dark.addEventListener("change", () => settings.theme === "system" && applyTheme());
applyTheme();

// ---------- Tab cloak (applied while the window is unfocused) ----------
const favicon = $("favicon");
// Each preset uses the real site's own favicon, loaded straight from that site. No favicon service is involved.
const CLOAKS = {
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
// An icon address must be a full http(s) address. Returns it cleaned up, or "" if it isn't one.
const iconUrl = (s) => { try { const u = new URL((s || "").trim()); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch { return ""; } };
// { title, icon } for a preset (defaults to the selected one). Custom needs both a title and an icon address; without
// them it does nothing (the tab keeps looking like Silicon).
function cloakIdentity(key = settings.cloak) {
  if (key === "custom") {
    const icon = iconUrl(settings.cloakIcon), title = (settings.cloakTitle || "").trim();
    return icon && title ? { title, icon } : CLOAKS.silicon;
  }
  const c = CLOAKS[key] || CLOAKS.silicon;
  return { title: c.title, icon: c.icon };
}
const rest = { title: "Silicon", icon: "/favicon.svg" };
// The cloak shows while the window is unfocused, or always when "Always show cloak" is on.
let cloakBlur = false;
function refreshCloak() {
  const c = settings.cloakAlways || cloakBlur ? cloakIdentity() : rest;
  document.title = c.title;
  favicon.href = c.icon;
}
const setBlur = (on) => { cloakBlur = on; refreshCloak(); };
// Focus moving into a tab's iframe also fires window "blur"; only cloak when the whole document lost focus.
window.addEventListener("blur", () => setTimeout(() => !document.hasFocus() && setBlur(true), 0));
window.addEventListener("focus", () => setBlur(false));
document.addEventListener("visibilitychange", () => setBlur(document.hidden));
refreshCloak();

// ---------- Privacy: panic key, cover window, auto cover, leave confirmation ----------
const PANIC_DEFAULT = "https://www.google.com/";
function panicTarget() {
  const u = normalizeUrl(settings.panicUrl || "");
  return u && /^https?:/.test(u) ? u : PANIC_DEFAULT; // never silicon:// or javascript:
}
// Redirect as fast as possible. Blank the page first so nothing stays visible while the navigation starts.
function goPanic() {
  const target = panicTarget();
  window.onbeforeunload = null; // never let "confirm before leaving" delay a panic
  try { document.documentElement.style.display = "none"; if (top !== self) top.document.documentElement.style.display = "none"; } catch {}
  try { top.location.replace(target); } catch { location.replace(target); }
}
// Opens Silicon in an about:blank or blob: window, then sends this tab to the panic site.
function openCover(kind) {
  const c = settings.cloak === "silicon" ? cloakIdentity("google") : cloakIdentity();
  const src = new URL("/", location.origin); src.searchParams.set("cover", "1");
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.title)}</title><link rel="icon" href="${esc(c.icon)}"><style>html,body{margin:0;height:100%;background:#2e3035}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe src="${esc(src.href)}" allow="fullscreen; autoplay; clipboard-read; clipboard-write"></iframe></body></html>`;
  let w;
  if (kind === "blob") w = window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
  else {
    // Build the page with DOM calls. document.open()/write() would change the window's URL to this site's address.
    w = window.open("about:blank", "_blank");
    if (w) {
      const d = w.document;
      d.title = c.title;
      const link = d.createElement("link"); link.rel = "icon"; link.href = c.icon; d.head.appendChild(link);
      d.documentElement.style.height = d.body.style.height = "100%";
      d.body.style.cssText = "margin:0;height:100%;background:#2e3035";
      const f = d.createElement("iframe");
      f.src = src.href; f.allow = "fullscreen; autoplay; clipboard-read; clipboard-write";
      f.style.cssText = "border:0;width:100%;height:100%;display:block";
      d.body.appendChild(f);
    }
  }
  if (!w) { flash("Popup blocked. Allow popups for this site, then try again."); return false; }
  goPanic();
  return true;
}
function applyLeaveGuard() {
  window.onbeforeunload = settings.confirmLeave ? (e) => { e.preventDefault(); e.returnValue = ""; return ""; } : null;
}

// Returns true when the key press was a tab shortcut and has been handled.
function tabShortcut(e) {
  const mod = e.ctrlKey || e.metaKey;
  if (e.ctrlKey && e.metaKey) return false;
  if (e.altKey && !mod) { // Alt (Option) versions
    if (e.shiftKey && e.code === "KeyT") return reopenClosedTab(), true;
    if (e.shiftKey) return false;
    if (e.code === "KeyT") return openTab("silicon://newtab"), true;
    if (e.code === "KeyW") return closeTab(active), true;
    if (e.code === "BracketRight") return cycleTab(1), true;
    if (e.code === "BracketLeft") return cycleTab(-1), true;
    const d = /^Digit([1-9])$/.exec(e.code); if (d) return goToTab(+d[1]), true;
    return false;
  }
  if (!mod || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (e.ctrlKey && e.key === "Tab") return cycleTab(e.shiftKey ? -1 : 1), true;
  if (e.shiftKey && k === "t") return reopenClosedTab(), true;
  if (e.shiftKey) return false;
  if (k === "t") return openTab("silicon://newtab"), true;
  if (k === "w") return closeTab(active), true;
  if (/^[1-9]$/.test(e.key)) return goToTab(+e.key), true;
  return false;
}
let capturingKey = false; // true while the settings page is recording a new panic key
let coverFired = false;
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn", "OS"]);
const comboMatches = (e, c) => e.key.toLowerCase() === String(c.key).toLowerCase() && !!c.ctrl === e.ctrlKey && !!c.alt === e.altKey && !!c.shift === e.shiftKey && !!c.meta === e.metaKey;
function onKey(e) {
  if (capturingKey || e.isComposing) return;
  if (settings.panicEnabled && settings.panicKey && comboMatches(e, settings.panicKey)) {
    e.preventDefault(); e.stopImmediatePropagation();
    goPanic();
    return;
  }
  // History: Ctrl+H (Ctrl on a Mac too)
  if (!e.altKey && !e.shiftKey && e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "h") {
    e.preventDefault(); e.stopImmediatePropagation();
    openTab("silicon://history");
    return;
  }
  // Address bar and reload, like Chrome: Ctrl+L and Ctrl+R (Ctrl on a Mac too). Shift+R is left alone so a hard refresh of Silicon still works.
  if (!e.altKey && !e.shiftKey && (e.ctrlKey !== e.metaKey) && (e.key.toLowerCase() === "l" || e.key.toLowerCase() === "r")) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.key.toLowerCase() === "l") { address.focus(); address.select(); } else reloadActive();
    return;
  }
  // Zoom: Ctrl+Plus, Ctrl+Minus and Ctrl+0 (Ctrl on a Mac too)
  if (!e.altKey && (e.ctrlKey !== e.metaKey)) {
    const zk = e.key === "+" || e.key === "=" ? 1 : e.key === "-" || e.key === "_" ? -1 : e.key === "0" && !e.shiftKey ? 0 : null;
    if (zk !== null) { e.preventDefault(); e.stopImmediatePropagation(); zk === 0 ? setZoom(1) : zoomBy(zk); return; }
  }
  // Find in page: Ctrl+F (Cmd+F on a Mac)
  if (!e.altKey && !e.shiftKey && (e.ctrlKey !== e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); e.stopImmediatePropagation(); openFind(); return; }
  // Tabs. On Windows and Linux, browsers keep Ctrl+T, W, Tab and 1-9 for themselves, so those only reach Silicon when the
  // browser lets them through (Ctrl is free on a Mac); the Alt versions work everywhere.
  // Back and forward: Alt+Left and Alt+Right (Option on a Mac). Not while typing in a field, where they move the cursor by a word.
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    const t = e.target;
    if (!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) { e.preventDefault(); e.stopImmediatePropagation(); $(e.key === "ArrowLeft" ? "back" : "forward").click(); return; }
  }
  if (tabShortcut(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  // Show / hide the bookmarks bar, like Chrome: Ctrl+Shift+B
  if (e.shiftKey && !e.altKey && (e.ctrlKey !== e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); e.stopImmediatePropagation(); updateSettings({ showBookmarksBar: !settings.showBookmarksBar }); return; }
  // Bookmark manager, like Chrome: Ctrl+Shift+O
  if (e.shiftKey && !e.altKey && (e.ctrlKey !== e.metaKey) && e.key.toLowerCase() === "o") { e.preventDefault(); e.stopImmediatePropagation(); openTab("silicon://bookmarks"); return; }
  // Bookmark this page, like Chrome: Ctrl+D (Cmd+D on a Mac)
  if (!e.altKey && !e.shiftKey && (e.ctrlKey !== e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); e.stopImmediatePropagation(); toggleBookmark(); return; }
  // Auto cover: the first real key press (not a modifier, not a mouse click) while on the front page
  // (silicon://newtab). Typing in Settings or on a site doesn't trigger it.
  if (settings.autoCover && !isCover && !coverFired && !MODIFIER_KEYS.has(e.key) && tabs.get(active)?.url === "silicon://newtab") {
    coverFired = true;
    openCover("about:blank");
  }
}
// Key events don't cross iframe boundaries, so the listener goes on every window we can reach.
// Deduped by document: an iframe's window object survives navigation, but each page gets a new document.
const keyed = new WeakSet();
function attachKeys(win) {
  try {
    const doc = win?.document;
    if (doc && !keyed.has(doc)) { keyed.add(doc); win.addEventListener("keydown", onKey, true); }
  } catch {}
}
attachKeys(window);
applyLeaveGuard();


// ---------- Data: export / import / clear / reset ----------
// Everything Silicon saves lives in this origin's localStorage (settings, shortcuts, favorites, recents,
// per-game proxy choices, saves of games hosted here), so a backup is simply all of it.
const DATA_FORMAT = 1;
const SETTINGS_KEYS = ["settings", "theme", "cloak"]; // kept by "Clear data", removed by "Reset all settings"
const dataApi = {
  export() {
    const ls = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); } } catch {}
    return { app: "silicon", format: DATA_FORMAT, exportedAt: new Date().toISOString(), localStorage: ls };
  },
  // Returns the entries of a backup file's text, or throws an Error with a user-readable message.
  parse(text) {
    let o; try { o = JSON.parse(text); } catch { throw new Error("That file isn't valid JSON."); }
    if (!o || o.app !== "silicon" || !o.localStorage || typeof o.localStorage !== "object" || Array.isArray(o.localStorage)) throw new Error("That isn't a Silicon backup.");
    if (o.format > DATA_FORMAT) throw new Error("This backup is from a newer version of Silicon.");
    const entries = Object.entries(o.localStorage);
    if (entries.length > 5000 || text.length > 5e6) throw new Error("That backup is too large.");
    for (const [k, v] of entries) if (typeof v !== "string" || k.length > 200) throw new Error("That backup has an entry Silicon can't read.");
    return entries;
  },
  // Replaces everything with the backup's contents, then reloads.
  import(entries) { try { localStorage.clear(); for (const [k, v] of entries) localStorage.setItem(k, v); } catch {} reloadShell(); },
  // Removes saved data (shortcuts, favorites, recents, saves, proxy caches/cookies) but keeps settings.
  async clear() {
    try { for (const k of Object.keys(localStorage)) if (!SETTINGS_KEYS.includes(k)) localStorage.removeItem(k); sessionStorage.clear(); } catch {}
    try { for (const name of await caches.keys()) await caches.delete(name); } catch {}
    try { for (const db of (await indexedDB.databases?.()) || []) if (db.name) indexedDB.deleteDatabase(db.name); } catch {}
    setTimeout(reloadShell, 250); // give the database deletions a moment to be issued
  },
  resetSettings() { try { for (const k of SETTINGS_KEYS) localStorage.removeItem(k); } catch {} reloadShell(); },
};
function reloadShell() { window.onbeforeunload = null; location.reload(); } // never let "confirm before leaving" block this

// ---------- Tabs ----------

const boot = () => (ready ||= init(settings).catch((e) => { ready = null; throw e; }));
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const setLabel = (tab, text) => (tab.btn.querySelector(".title").textContent = text);
// Bookmarks: { title, url, icon? } in localStorage "bookmarks:list", shown in the bar under the address bar and on
// silicon://bookmarks. (The shortcuts on the new tab page are a separate list, "bookmarks".) icon is a small data URL
// copied from the page's own favicon when it was bookmarked, so nothing is looked up elsewhere.
const BM_KEY = "bookmarks:list";
const bmLoad = () => { try { const l = JSON.parse(localStorage.getItem(BM_KEY)); return Array.isArray(l) ? l : []; } catch { return []; } };
const bmSave = (l) => { try { localStorage.setItem(BM_KEY, JSON.stringify(l)); } catch {} };
const sameUrl = (a, b) => { try { return new URL(a).href === new URL(b).href; } catch { return a === b; } };
const bmIndex = (url) => bmLoad().findIndex((b) => sameUrl(b.url, url));
function tabIconData(tab) {
  try {
    const img = tab.btn.querySelector("img.fav");
    if (!img || !img.complete || !img.naturalWidth) return undefined;
    const c = document.createElement("canvas"); c.width = c.height = 32;
    c.getContext("2d").drawImage(img, 0, 0, 32, 32);
    return c.toDataURL("image/png");
  } catch { return undefined; }
}
function paintBookmark(tab = tabs.get(active)) {
  const btn = $("bookmark-btn"), web = !!tab && /^https?:\/\//i.test(tab.url || "");
  btn.disabled = !web;
  const on = web && bmIndex(tab.url) >= 0;
  btn.classList.toggle("on", on);
  btn.firstElementChild.classList.toggle("fill", on);
  btn.title = on ? "Remove bookmark (Ctrl+D)" : "Bookmark this page (Ctrl+D)";
}
function toggleBookmark() {
  const tab = tabs.get(active);
  if (!tab || !/^https?:\/\//i.test(tab.url || "")) return;
  const list = bmLoad(), i = list.findIndex((b) => sameUrl(b.url, tab.url));
  if (i >= 0) list.splice(i, 1);
  else list.push({ title: tab.btn.querySelector(".title").textContent || hostOf(tab.url), url: tab.url, icon: tabIconData(tab) });
  bmSave(list); paintBookmark(tab); renderBookmarkBar();
}

// ---------- Menus (three dots, bookmarks bar overflow and right-click) ----------
const menuEl = $("menu");
function closeMenu() { menuEl.hidden = true; menuEl.replaceChildren(); }
// items: { icon, label, hint?, run } or "-" for a divider. at: the element it opens under, or a { x, y } point.
function showMenu(items, at, { align = "right" } = {}) {
  closeMenu();
  for (const it of items) {
    if (it === "-") { const hr = document.createElement("div"); hr.className = "menu-sep"; menuEl.append(hr); continue; }
    const b = document.createElement("button");
    b.className = "menu-item"; b.role = "menuitem";
    b.innerHTML = `<span class="ms"></span><span class="menu-label"></span><span class="menu-hint"></span>`;
    b.children[0].textContent = it.icon || ""; b.children[1].textContent = it.label; b.children[2].textContent = it.hint || "";
    if (it.img) { const img = new Image(); img.alt = ""; img.src = it.img; b.children[0].replaceWith(img); img.className = "menu-img"; }
    b.onclick = () => { closeMenu(); it.run(); };
    menuEl.append(b);
  }
  menuEl.hidden = false;
  const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
  let x, y;
  if (at.getBoundingClientRect) { const r = at.getBoundingClientRect(); y = r.bottom + 4; x = align === "right" ? r.right - w : r.left; }
  else { x = at.x; y = at.y; }
  menuEl.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + "px";
  menuEl.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + "px";
  menuEl.querySelector("button")?.focus();
}
// Close on a click elsewhere in the shell, on Escape, or when focus moves into a page (clicks inside a frame never reach us).
document.addEventListener("pointerdown", (e) => { if (!menuEl.hidden && !menuEl.contains(e.target) && !e.target.closest("[data-opens-menu]")) closeMenu(); }, true);
addEventListener("blur", closeMenu);
addEventListener("resize", () => { closeMenu(); renderBookmarkBar(); if (!findBar.hidden) placeFindBar(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menuEl.hidden) { closeMenu(); e.stopPropagation(); } }, true);

$("menu-btn").onclick = () => {
  if (!menuEl.hidden && menuEl.dataset.for === "main") return closeMenu();
  showMenu([
    { icon: "bookmarks", label: "Bookmarks", hint: "Ctrl+Shift+O", run: () => openTab("silicon://bookmarks") },
    { icon: "history", label: "History", hint: "Ctrl+H", run: () => openTab("silicon://history") },
    { icon: "settings", label: "Settings", run: () => openTab("silicon://settings") },
    "-",
    { icon: "keyboard", label: "Keyboard shortcuts", run: showShortcuts },
  ], $("menu-btn"));
  menuEl.dataset.for = "main";
};

// ---------- Keyboard shortcuts guide ----------
const keyName = (c) => [c.ctrl && "Ctrl", c.alt && "Alt", c.shift && "Shift", c.meta && "Cmd", String(c.key).length === 1 ? String(c.key).toUpperCase() : c.key === " " ? "Space" : c.key].filter(Boolean).join("+");
function showShortcuts() {
  const panic = settings.panicEnabled && settings.panicKey ? [keyName(settings.panicKey)] : null;
  const groups = [
    ["Tabs", [
      ["New tab", ["Ctrl+T", "Alt+T"]],
      ["Close tab", ["Ctrl+W", "Alt+W"]],
      ["Reopen closed tab", ["Ctrl+Shift+T", "Alt+Shift+T"]],
      ["Next tab", ["Ctrl+Tab", "Alt+]"]],
      ["Previous tab", ["Ctrl+Shift+Tab", "Alt+["]],
      ["Go to tab 1 to 8", ["Ctrl+1 to 8", "Alt+1 to 8"]],
      ["Go to the last tab", ["Ctrl+9", "Alt+9"]],
    ]],
    ["Pages", [
      ["Back and forward", ["Alt+Left", "Alt+Right"]],
      ["Go to the address bar", ["Ctrl+L"]],
      ["Reload the page", ["Ctrl+R"]],
      ["Zoom in", ["Ctrl++"]],
      ["Zoom out", ["Ctrl+-"]],
      ["Reset zoom", ["Ctrl+0"]],
      ["Find in page", ["Ctrl+F"]],
      ["Bookmark this page", ["Ctrl+D"]],
      ["Bookmarks", ["Ctrl+Shift+O"]],
      ["Show or hide the bookmarks bar", ["Ctrl+Shift+B"]],
      ["History", ["Ctrl+H"]],
      ["Search in Games, History and Bookmarks", ["/"]],
    ]],
    ["Privacy", [["Panic key", panic || ["Not set (Settings, Privacy)"]]]],
  ];
  const box = $("shortcuts-body"); box.replaceChildren();
  for (const [title, rows] of groups) {
    const h = document.createElement("h3"); h.textContent = title; box.append(h);
    for (const [label, keys] of rows) {
      const row = document.createElement("div"); row.className = "sc-row";
      const l = document.createElement("span"); l.textContent = label;
      const k = document.createElement("span"); k.className = "sc-keys";
      keys.forEach((x, i) => { if (i) k.append(" or "); const kbd = document.createElement("kbd"); kbd.textContent = x; k.append(kbd); });
      row.append(l, k); box.append(row);
    }
  }
  $("shortcuts-dialog").showModal();
}
$("shortcuts-dialog").querySelector(".cancel").onclick = () => $("shortcuts-dialog").close();
$("shortcuts-dialog").addEventListener("click", (e) => { if (e.target === $("shortcuts-dialog")) $("shortcuts-dialog").close(); });

// ---------- Edit bookmark dialog (name and address, like editing a shortcut) ----------
const editDlg = $("bm-edit");
const editName = editDlg.querySelector('[name="name"]'), editUrl = editDlg.querySelector('[name="url"]'), editErr = editDlg.querySelector(".error");
let editing = null; // the bookmark being edited
function editBookmark(b) {
  editing = b; editName.value = b.title || ""; editUrl.value = b.url; editErr.textContent = "";
  editDlg.showModal(); editName.focus(); editName.select();
}
editDlg.querySelector(".cancel").onclick = () => editDlg.close();
editDlg.addEventListener("click", (e) => { if (e.target === editDlg) editDlg.close(); });
editDlg.querySelector("form").onsubmit = (e) => {
  e.preventDefault();
  const url = normalizeUrl(editUrl.value);
  if (!url || url.startsWith("silicon://")) { editErr.textContent = "Enter a valid website address."; return; }
  const list = bmLoad(), i = list.findIndex((x) => sameUrl(x.url, editing.url));
  if (i < 0) { editDlg.close(); return; }
  if (list.some((x, j) => j !== i && sameUrl(x.url, url))) { editErr.textContent = "That address is already in your bookmarks."; return; }
  const entry = { title: editName.value.trim() || hostOf(url), url };
  if (list[i].icon && sameUrl(list[i].url, url)) entry.icon = list[i].icon; // keep its icon unless the address changed
  list[i] = entry; bmSave(list);
  editDlg.close(); renderBookmarkBar(); paintBookmark();
};

// ---------- Bookmarks bar ----------
// A row under the address bar. Bookmarks that don't fit go in a "»" menu at the end.
const barEl = $("bookmarkbar");
function openBookmark(b, e) {
  if (e && (e.metaKey || e.ctrlKey || e.button === 1)) openTab(b.url);
  else navigate(tabs.get(active), b.url);
}
function renderBookmarkBar() {
  const list = bmLoad();
  const show = settings.showBookmarksBar && list.length > 0;
  barEl.hidden = !show;
  barEl.replaceChildren();
  if (!show) return;
  const chips = list.map((b) => {
    const el = document.createElement("button");
    el.className = "bm"; el.title = `${b.title}\n${b.url}`;
    el.innerHTML = `<span class="bm-ico"></span><span class="bm-label"></span>`;
    el.lastChild.textContent = b.title || hostOf(b.url);
    if (b.icon) { const img = new Image(); img.alt = ""; img.src = b.icon; el.firstChild.append(img); }
    else el.firstChild.innerHTML = '<span class="ms">public</span>';
    el.onclick = (e) => openBookmark(b, e);
    el.onauxclick = (e) => e.button === 1 && openBookmark(b, e);
    el.oncontextmenu = (e) => {
      e.preventDefault();
      showMenu([
        { icon: "open_in_new", label: "Open in new tab", run: () => openTab(b.url) },
        { icon: "edit", label: "Edit bookmark", run: () => editBookmark(b) },
        { icon: "delete", label: "Delete", run: () => { bmSave(bmLoad().filter((x) => !sameUrl(x.url, b.url))); renderBookmarkBar(); paintBookmark(); } },
      ], { x: e.clientX, y: e.clientY });
    };
    return el;
  });
  barEl.append(...chips);
  // Move whatever doesn't fit into the overflow menu
  const room = barEl.clientWidth - 16 - 40; // padding + the » button
  let used = 0, fit = chips.length;
  for (let i = 0; i < chips.length; i++) { used += chips[i].offsetWidth + 2; if (used > room && i < chips.length) { fit = i; break; } }
  if (fit < chips.length) {
    if (fit === 0) fit = 0;
    chips.slice(fit).forEach((c) => c.remove());
    const more = document.createElement("button");
    more.className = "bm bm-more"; more.title = "More bookmarks"; more.dataset.opensMenu = "1";
    more.innerHTML = '<span class="ms">keyboard_double_arrow_right</span>';
    more.onclick = () => {
      if (!menuEl.hidden && menuEl.dataset.for === "more") return closeMenu();
      showMenu(list.slice(fit).map((b) => ({ icon: "public", img: b.icon, label: b.title || hostOf(b.url), run: () => openBookmark(b) })), more, { align: "right" });
      menuEl.dataset.for = "more";
    };
    barEl.append(more);
  }
}
const showAddress = (tab) => {
  if (active !== tab.id) return;
  paintBookmark(tab);
  paintZoom(tab);
  if (document.activeElement !== address) address.value = tab.url === "silicon://newtab" ? "" : tab.url;
  // Omnibox icon: search on the new tab page, lock for https, open lock for plain http.
  $("site-icon").textContent = tab.url === "silicon://newtab" ? "search" : tab.url.startsWith("silicon://") ? "info" : tab.url.startsWith("https:") ? "lock" : "lock_open";
};

// Returns an absolute URL if the input looks like an address, otherwise null (=> treat as a search).
function normalizeUrl(input) {
  input = input.trim();
  if (!input || /\s/.test(input)) return null;
  if (/^silicon:\/\//i.test(input)) return "silicon://" + input.slice(10); // keep the query (?game=...) as typed
  if (/^https?:\/\//i.test(input)) { try { return new URL(input).href; } catch { return null; } }
  if (/^[a-z][a-z0-9+.-]*:/i.test(input) && !/^[^/]*:\d+(\/|$)/.test(input)) return null; // mailto:, javascript:, ...
  let u; try { u = new URL("https://" + input); } catch { return null; }
  if (u.username || u.password) return null;
  const h = u.hostname;
  const tld = h.split(".").pop();
  const ok = h === "localhost" || h.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)
    || (h.includes(".") && /^([a-z]{2,}|xn--[a-z0-9-]+)$/i.test(tld));
  if (!ok) return null;
  if (h === "localhost" || /^[\d.]+$/.test(h)) return new URL("http://" + input).href; // local/IP targets rarely have TLS
  return u.href;
}
const searchTemplate = () => (settings.searchEngine === "custom" ? normalizeSearchTemplate(settings.customSearch) : null) || (ENGINES[settings.searchEngine]?.url ?? ENGINES.duckduckgo.url);
const toUrl = (input) => normalizeUrl(input) ?? searchTemplate().replace("%s", encodeURIComponent(input.trim()));

// The page's own icon, read from its <link rel="icon"> (or /favicon.ico). The proxied document reports original URLs,
// so the native getter is used to get the proxied address, which loads through the proxy like the page itself.
const nativeHref = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, "href").get;
function pageIcon(doc) {
  try {
    const l = doc.querySelector('link[rel~="icon"]');
    if (l) return nativeHref.call(l);
    const d = doc.createElement("link"); d.rel = "icon"; d.setAttribute("href", "/favicon.ico");
    return nativeHref.call(d);
  } catch { return ""; }
}
// Tab icon: a site favicon (img), a Material glyph, or nothing (new tab page, like Chrome).
function setIcon(tab, { img, glyph } = {}) {
  tab.btn.classList.toggle("no-icon", !img && !glyph);
  const slot = tab.btn.querySelector(".tab-icon, .fav");
  let el;
  if (img) {
    el = new Image();
    el.className = "fav"; el.alt = "";
    el.onerror = () => setIcon(tab, { glyph: "public" });
    el.src = img;
  } else {
    el = document.createElement("span");
    el.className = "ms tab-icon"; el.textContent = glyph || "public";
  }
  slot.replaceWith(el);
}
const INTERNAL_ICONS = { newtab: undefined, error: "cloud_off", settings: "settings", games: "sports_esports", bookmarks: "bookmark", history: "history", play: "sports_esports" };

// Tabs in the order they are shown (the strip's order, which drag-to-reorder changes), without ones that are closing.
const openTabEls = () => [...$("tabs").children].filter((el) => el.classList.contains("tab") && !el.classList.contains("closing"));
const tabOrder = () => openTabEls().map((el) => el.dataset.id);
// Recently closed tabs for "Reopen closed tab". Kept in memory only, so they are gone when Silicon is closed.
const closedTabs = [];
// at: position among the open tabs (default: the end)
function createTab(at) {
  const id = "t" + ++seq;
  const btn = document.createElement("button");
  btn.className = "tab no-icon entering"; btn.dataset.id = id; btn.role = "tab"; btn.draggable = true;
  btn.innerHTML = `<span class="tab-inner"><span class="ms tab-icon">public</span><span class="spinner"></span><span class="title">New Tab</span><span class="ms close" role="button" aria-label="Close tab">close</span></span>`;
  const page = document.createElement("section");
  page.className = "page";
  const iframe = document.createElement("iframe");
  iframe.title = "Page";
  page.append(iframe);
  const tab = { id, btn, page, iframe, frame: null, url: "silicon://newtab" };
  iframe.addEventListener("load", () => onLoad(tab));
  btn.addEventListener("animationend", () => btn.classList.remove("entering"), { once: true });
  $("tabs").insertBefore(btn, openTabEls()[at] || null);
  stage.append(page);
  tabs.set(id, tab);
  return tab;
}

// Loading state: spinner on the tab, progress bar under the toolbar while the active tab loads.
function setLoading(tab, on) {
  clearTimeout(tab.loadTimer);
  tab.loading = on;
  tab.btn.classList.toggle("loading", on);
  if (on) tab.loadTimer = setTimeout(() => setLoading(tab, false), 30000); // never spin forever
  syncLoader();
}
const syncLoader = () => {
  const on = !!tabs.get(active)?.loading;
  $("loader").classList.toggle("on", on);
  $("reload").firstElementChild.textContent = on ? "close" : "refresh"; // stop while loading, like Chrome
  $("reload").title = on ? "Stop loading" : "Reload";
};

// Browsing history: pages opened through the proxy, newest last, kept in this browser's localStorage under "history"
// ({ u: url, t: title, ts: time }). Shown on silicon://history. Off when "Save browsing history" is off.
const HISTORY_KEY = "history", HISTORY_MAX = 1000;
function recordVisit(url, title) {
  if (!settings.saveHistory || !/^https?:\/\//i.test(url)) return;
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    const last = list[list.length - 1], now = Date.now();
    if (last && last.u === url && now - last.ts < 30 * 60 * 1000) { last.t = title || last.t; last.ts = now; } // a reload, not a new visit
    else list.push({ u: url, t: title || "", ts: now });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-HISTORY_MAX)));
  } catch {}
}

// When a site can't be reached, the proxy's service worker answers with a bare text page ("Internal Service Worker Error: ...").
// This spots that page and returns its message (or null for a normal page), so Silicon can show its own error page instead.
function proxyErrorText(doc) {
  try {
    if (!doc.body || doc.body.children.length > 1) return null;
    const t = (doc.body.innerText || "").trim();
    if (t.length > 4000) return null;
    if (/^Internal Service Worker Error:/i.test(t)) return t.replace(/^Internal Service Worker Error:\s*/i, "");
    if (/^Couldn't load this page through the proxy/i.test(t)) return "The proxy did not respond (service worker). Reload the tab, or check that the server is running.";
  } catch {}
  return null;
}
function showProxyError(tab, detail) {
  const q = new URLSearchParams({ u: tab.url, d: String(detail).slice(0, 600) });
  try { tab.iframe.contentWindow.location.replace("/silicon/error?" + q); } catch { tab.iframe.src = "/silicon/error?" + q; } // replace: Back skips the failed page
}

function onLoad(tab) {
  setLoading(tab, false);
  attachKeys(tab.iframe.contentWindow); // silicon:// pages; proxied windows are covered by the frame plugin
  let doc; try { doc = tab.iframe.contentDocument; } catch { return; }
  if (!doc || doc.documentURI === "about:blank") return;
  const name = doc.documentElement.dataset.silicon;
  if (!name) { const err = proxyErrorText(doc); if (err !== null) return showProxyError(tab, err); }
  if (name) {
    if (name !== "error") tab.url = "silicon://" + name + (doc.location.search || ""); // the error page keeps showing the address that failed
    applyThemeTo(tab.iframe, document.documentElement.dataset.theme);
  }
  setLabel(tab, doc.title || (name ? name : hostOf(tab.url)));
  if (!name) recordVisit(tab.url, doc.title);
  setIcon(tab, name ? { glyph: INTERNAL_ICONS[name] } : { img: (tab.lastIcon = pageIcon(doc)) });
  if (!name) setTimeout(() => { try { const i = pageIcon(tab.iframe.contentDocument); if (i && i !== tab.lastIcon && tab.iframe.contentDocument === doc) setIcon(tab, { img: i }); } catch {} }, 2000); // icons set by scripts
  tab.iframe.classList.remove("pending");
  showAddress(tab);
  if (!findBar.hidden && tab.id === active) runFind(); // a new page: search it too
}

function activate(id) {
  active = id;
  for (const t of tabs.values()) {
    t.btn.classList.toggle("active", t.id === id);
    t.page.classList.toggle("active", t.id === id);
  }
  const tab = tabs.get(id);
  // Scroll the tab strip only; scrollIntoView can nudge the whole page.
  const strip = $("tabs"), b = tab.btn;
  if (b.offsetLeft < strip.scrollLeft) strip.scrollLeft = b.offsetLeft;
  else if (b.offsetLeft + b.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = b.offsetLeft + b.offsetWidth - strip.clientWidth;
  address.value = "";
  closeSuggestions();
  if (!findBar.hidden) { clearFindMarks(); runFind(); } // the bar stays open and searches the new tab
  showAddress(tab);
  syncLoader();
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  const ids = tabOrder();
  const next = ids[ids.indexOf(id) + 1] ?? ids[ids.indexOf(id) - 1];
  if (tab.url && tab.url !== "silicon://newtab") { closedTabs.push({ url: tab.url, at: ids.indexOf(id) }); if (closedTabs.length > 10) closedTabs.shift(); }
  tabs.delete(id);
  tab.page.remove();
  tab.btn.classList.add("closing");
  setTimeout(() => tab.btn.remove(), 180);
  if (!next) openTab("silicon://newtab");
  else if (active === id) activate(next);
}
function reopenClosedTab() {
  const c = closedTabs.pop();
  if (!c) return flash("No recently closed tabs");
  openTab(c.url, Math.min(c.at, tabOrder().length));
}
function duplicateTab(tab) { openTab(tab.url, tabOrder().indexOf(tab.id) + 1); }
function closeOtherTabs(tab) { activate(tab.id); for (const id of tabOrder()) if (id !== tab.id) closeTab(id); }
function closeTabsToRight(tab) {
  const ids = tabOrder(), i = ids.indexOf(tab.id);
  if (!ids.slice(i + 1).includes(active)) { for (const id of ids.slice(i + 1)) closeTab(id); return; }
  activate(tab.id); for (const id of ids.slice(i + 1)) closeTab(id);
}
function cycleTab(step) {
  const ids = tabOrder(); if (ids.length < 2) return;
  activate(ids[(ids.indexOf(active) + step + ids.length) % ids.length]);
}
function goToTab(n) { const ids = tabOrder(); const id = n === 9 ? ids[ids.length - 1] : ids[n - 1]; if (id) activate(id); }

async function navigate(tab, input) {
  if (/^\/(?!\/)/.test(input.trim())) { // "/games/foo/index.html": served by this server, not proxied
    tab.url = location.origin + input.trim();
    setLabel(tab, "Loading…");
    showAddress(tab);
    tab.iframe.classList.remove("pending");
    tab.iframe.src = input.trim();
    return;
  }
  const url = toUrl(input);
  if (url.startsWith("silicon://")) {
    const m = url.match(/^silicon:\/\/([^/?#]+)\/?([?#].*)?$/);
    const name = m?.[1].toLowerCase();
    if (!name || !INTERNAL.has(name)) { flash(`Unknown page: ${url}`); showAddress(tab); return; }
    tab.iframe.classList.remove("pending");
    tab.iframe.src = "/silicon/" + name + (m[2] || ""); // instant: no loading state
    return;
  }
  try { await boot(); } catch (err) { return flash(err.message); }
  tab.frame ||= (() => {
    return createFrame(tab.iframe, (url) => { tab.url = url; showAddress(tab); }, attachKeys, { onOpen: (url) => openTab(url, tabOrder().indexOf(tab.id) + 1) });
  })();
  tab.url = url;
  setLabel(tab, hostOf(url));
  showAddress(tab);
  tab.iframe.classList.add("pending");
  setLoading(tab, true);
  tab.frame.go(url);
}

function openTab(input, at) {
  const tab = createTab(at);
  activate(tab.id);
  navigate(tab, input);
  return tab;
}

let flashTimer;
function flash(msg) {
  status.textContent = msg; status.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (status.hidden = true), 4000);
}

// Used by silicon:// pages: parent.silicon.navigate(window, "https://...")
window.silicon = { normalizeUrl, openCover, data: dataApi,
  // For silicon://play: makes a proxied frame for an <iframe> that lives inside the player page.
  createGameFrame: async (iframe) => { await boot(); return createFrame(iframe, null, attachKeys, { fixHtml: true }); }, retitle: (win) => { const t = [...tabs.values()].find((t) => t.iframe.contentWindow === win); if (t) setLabel(t, win.document.title); }, openTab: (input) => openTab(input), setCapture: (on) => (capturingKey = !!on), settings: { get: () => settings, set: updateSettings, iconUrl, engines: ENGINES, normalizeSearchTemplate, cloaks: CLOAKS, cloakIdentity, defaultWisp }, navigate: (win, input) => { const t = [...tabs.values()].find((t) => t.iframe.contentWindow === win); if (t) navigate(t, input); } };

// ---------- Wiring ----------
$("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn || btn.classList.contains("closing")) return;
  if (e.target.closest(".close")) closeTab(btn.dataset.id);
  else activate(btn.dataset.id);
});
$("tabs").addEventListener("auxclick", (e) => {
  const btn = e.target.closest(".tab");
  if (e.button === 1 && btn) closeTab(btn.dataset.id);
});
// Drag to reorder: the dragged tab moves along the strip as the pointer passes the middle of the others.
let dragTab = null;
$("tabs").addEventListener("dragstart", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn || btn.classList.contains("closing")) return e.preventDefault();
  dragTab = btn; btn.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", btn.dataset.id);
});
$("tabs").addEventListener("dragover", (e) => {
  if (!dragTab) return;
  e.preventDefault();
  const over = e.target.closest(".tab");
  if (!over || over === dragTab || over.classList.contains("closing")) return;
  const r = over.getBoundingClientRect();
  $("tabs").insertBefore(dragTab, e.clientX < r.left + r.width / 2 ? over : over.nextSibling);
});
$("tabs").addEventListener("drop", (e) => e.preventDefault());
$("tabs").addEventListener("dragend", () => { dragTab?.classList.remove("dragging"); dragTab = null; });

// Right-click on a tab
$("tabs").addEventListener("contextmenu", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn || btn.classList.contains("closing")) return;
  e.preventDefault();
  const tab = tabs.get(btn.dataset.id), ids = tabOrder(), i = ids.indexOf(tab.id);
  showMenu([
    { icon: "add", label: "New tab", run: () => openTab("silicon://newtab", i + 1) },
    { icon: "refresh", label: "Reload", run: () => { activate(tab.id); $("reload").click(); } },
    { icon: "content_copy", label: "Duplicate", run: () => duplicateTab(tab) },
    ...(closedTabs.length ? ["-", { icon: "history", label: "Reopen closed tab", hint: "Ctrl+Shift+T", run: reopenClosedTab }] : []),
    "-",
    { icon: "close", label: "Close", run: () => closeTab(tab.id) },
    ...(ids.length > 1 ? [{ icon: "tab_close_right", label: "Close other tabs", run: () => closeOtherTabs(tab) }] : []),
    ...(i < ids.length - 1 ? [{ icon: "arrow_forward", label: "Close tabs to the right", run: () => closeTabsToRight(tab) }] : []),
  ], { x: e.clientX, y: e.clientY });
});
$("new-tab").onclick = () => openTab("silicon://newtab");
// ---------- Zoom ----------
// Zoom is remembered per site (all silicon:// pages share one level) in localStorage "zoom". The tab's frame is scaled with CSS
// and made correspondingly larger or smaller, so the page lays out as it would at that zoom and the pages themselves are not touched.
const ZOOM_KEY = "zoom", ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
const zoomSite = (url) => (/^https?:/i.test(url || "") ? hostOf(url) : "silicon://");
const zoomLoad = () => { try { const z = JSON.parse(localStorage.getItem(ZOOM_KEY)); return z && typeof z === "object" ? z : {}; } catch { return {}; } };
const zoomOf = (url) => { const z = Number(zoomLoad()[zoomSite(url)]); return z >= 0.25 && z <= 5 ? z : 1; };
function paintZoom(tab = tabs.get(active)) {
  if (!tab) return;
  const z = zoomOf(tab.url), f = tab.iframe;
  if (z === 1) { f.style.transform = f.style.width = f.style.height = f.style.transformOrigin = ""; }
  else { f.style.transformOrigin = "0 0"; f.style.transform = `scale(${z})`; f.style.width = `${100 / z}%`; f.style.height = `${100 / z}%`; }
  if (tab.id === active) { $("zoom-chip").hidden = z === 1; $("zoom-pct").textContent = Math.round(z * 100) + "%"; }
}
function setZoom(z) {
  const tab = tabs.get(active); if (!tab) return;
  const all = zoomLoad(), site = zoomSite(tab.url);
  if (z === 1) delete all[site]; else all[site] = z;
  try { localStorage.setItem(ZOOM_KEY, JSON.stringify(all)); } catch {}
  for (const t of tabs.values()) if (zoomSite(t.url) === site) paintZoom(t); // every tab on the same site follows
}
function zoomBy(dir) {
  const tab = tabs.get(active); if (!tab) return;
  const cur = zoomOf(tab.url);
  let i = ZOOM_LEVELS.findIndex((l) => l >= cur - 1e-6); if (i < 0) i = ZOOM_LEVELS.length - 1;
  if (Math.abs(ZOOM_LEVELS[i] - cur) > 1e-6 && dir < 0) i++; // between steps, going down starts from the step below
  setZoom(ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i + dir))]);
}
$("zoom-chip").onclick = () => setZoom(1);
addEventListener("storage", (e) => { if (e.key === ZOOM_KEY || e.key === null) for (const t of tabs.values()) paintZoom(t); });

// ---------- Find in page ----------
// Searches the text of the open tab and marks matches with the browser's highlight feature (CSS.highlights), so the page itself
// is not changed. Works on proxied pages and on silicon:// pages, because both live in this tab's frame. Matches that are split
// across formatting tags (for example "he<b>llo</b>") are not found.
const findBar = $("findbar"), findInput = $("find-input"), findCount = $("find-count");
let findRanges = [], findIndex = -1, findWin = null, findTimer;
const FIND_MAX = 5000;
function findDoc() { try { return tabs.get(active)?.iframe.contentDocument || null; } catch { return null; } }
function clearFindMarks() {
  try { findWin?.CSS?.highlights?.delete("silicon-find"); findWin?.CSS?.highlights?.delete("silicon-find-current"); } catch {}
  findRanges = []; findIndex = -1;
}
function placeFindBar() { findBar.style.top = stage.getBoundingClientRect().top + "px"; } // just under the toolbar and bookmarks bar
function runFind(keepPlace) {
  placeFindBar();
  const prev = findIndex;
  clearFindMarks();
  const q = findInput.value, doc = findDoc(), win = doc?.defaultView;
  findBar.classList.remove("none"); findCount.textContent = "";
  if (!q || !doc || !win || !win.CSS?.highlights || typeof win.Highlight === "undefined") {
    if (q && win && !win.CSS?.highlights) findCount.textContent = "Not supported";
    return;
  }
  findWin = win;
  if (!doc.getElementById("silicon-find-style")) { // colours for the marks, added once to the page's head
    const st = doc.createElement("style"); st.id = "silicon-find-style";
    st.textContent = "::highlight(silicon-find){background-color:#ffe066;color:#000}::highlight(silicon-find-current){background-color:#ff9632;color:#000}";
    (doc.head || doc.documentElement).append(st);
  }
  const needle = q.toLowerCase(), ranges = [];
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const el = n.parentElement;
      if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|OPTION)$/.test(el.tagName) || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      try { if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true })) return NodeFilter.FILTER_REJECT; } catch {} // hidden text isn't searched
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n && ranges.length < FIND_MAX; n = walker.nextNode()) {
    const text = n.nodeValue.toLowerCase();
    for (let i = text.indexOf(needle); i !== -1 && ranges.length < FIND_MAX; i = text.indexOf(needle, i + needle.length)) {
      const r = doc.createRange(); r.setStart(n, i); r.setEnd(n, i + needle.length); ranges.push(r);
    }
  }
  findRanges = ranges;
  if (!ranges.length) { findBar.classList.add("none"); findCount.textContent = "0/0"; return; }
  win.CSS.highlights.set("silicon-find", new win.Highlight(...ranges));
  showFindMatch(keepPlace && prev >= 0 ? Math.min(prev, ranges.length - 1) : 0);
}
function showFindMatch(i) {
  if (!findRanges.length) return;
  findIndex = (i + findRanges.length) % findRanges.length;
  const r = findRanges[findIndex];
  try {
    findWin.CSS.highlights.set("silicon-find-current", new findWin.Highlight(r));
    r.startContainer.parentElement?.scrollIntoView({ block: "center", inline: "nearest" });
  } catch {}
  findCount.textContent = `${findIndex + 1}/${findRanges.length}${findRanges.length >= FIND_MAX ? "+" : ""}`;
}
function openFind() {
  const doc = findDoc();
  let sel = ""; try { sel = doc?.defaultView.getSelection().toString().trim(); } catch {}
  findBar.hidden = false; placeFindBar();
  if (sel && sel.length < 100 && !/\n/.test(sel)) findInput.value = sel; // start from what is selected
  findInput.focus(); findInput.select();
  runFind();
}
function closeFind() {
  if (findBar.hidden) return;
  clearFindMarks(); findBar.hidden = true; findCount.textContent = "";
  try { tabs.get(active)?.iframe.contentWindow.focus(); } catch {}
}
findInput.addEventListener("input", () => { clearTimeout(findTimer); findTimer = setTimeout(() => runFind(), 120); });
findInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); showFindMatch(findIndex + (e.shiftKey ? -1 : 1)); }
  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeFind(); }
});
$("find-next").onclick = () => showFindMatch(findIndex + 1);
$("find-prev").onclick = () => showFindMatch(findIndex - 1);
$("find-close").onclick = closeFind;

// ---------- Address bar suggestions ----------
// Matches what you type against your bookmarks, your history and the silicon:// pages, all on this device. Nothing you type is
// sent anywhere until you press Enter, and there are no search suggestions from a search engine for that reason.
const sugEl = $("suggest");
let sugItems = [], sugIndex = -1;
const SILICON_PAGES = { games: "sports_esports", bookmarks: "bookmarks", history: "history", settings: "settings" };
function buildSuggestions(q) {
  q = q.trim();
  if (!q) return [];
  const lq = q.toLowerCase(), out = [], seen = new Set();
  const direct = normalizeUrl(q);
  out.push(direct ? { icon: "arrow_forward", main: q, sub: "Go to this address", url: direct } : { icon: "search", main: q, sub: `Search with ${ENGINES[settings.searchEngine]?.label || "your search engine"}`, search: true });
  if (direct) seen.add(direct);
  const score = (title, url) => {
    const host = hostOf(url).toLowerCase(), t = (title || "").toLowerCase();
    if (host.startsWith(lq) || url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").startsWith(lq)) return 3;
    if (t.startsWith(lq)) return 2;
    return host.includes(lq) || t.includes(lq) || url.toLowerCase().includes(lq) ? 1 : 0;
  };
  const found = [];
  for (const b of bmLoad()) { const sc = score(b.title, b.url); if (sc) found.push({ icon: "star", main: b.title || hostOf(b.url), sub: b.url, url: b.url, sc: sc + 0.5, img: b.icon }); }
  const hist = (() => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; } })();
  for (let i = hist.length - 1; i >= 0 && found.length < 80; i--) { const h = hist[i], sc = score(h.t, h.u); if (sc) found.push({ icon: "history", main: h.t || hostOf(h.u), sub: h.u, url: h.u, sc }); }
  for (const [name, icon] of Object.entries(SILICON_PAGES)) if (lq.length >= 2 && (name.startsWith(lq) || ("silicon://" + name).startsWith(lq))) found.push({ icon, main: name[0].toUpperCase() + name.slice(1), sub: "silicon://" + name, url: "silicon://" + name, sc: 3 });
  found.sort((a, b) => b.sc - a.sc); // stable: bookmarks first, then newest history among equals
  for (const f of found) { if (out.length >= 7) break; if (seen.has(f.url) || seen.has(new URL(f.url, "https://x").href)) continue; seen.add(f.url); out.push(f); }
  return out;
}
function paintSuggestions() {
  sugEl.hidden = !sugItems.length;
  sugEl.replaceChildren(...sugItems.map((it, i) => {
    const row = document.createElement("div");
    row.className = "sg" + (i === sugIndex ? " sel" : ""); row.role = "option";
    row.innerHTML = `<span class="ms sg-ico"></span><span class="sg-main"></span><span class="sg-sub"></span>`;
    row.children[0].textContent = it.icon;
    if (it.img) { const img = new Image(); img.alt = ""; img.src = it.img; img.className = "sg-img"; row.children[0].replaceWith(img); }
    row.children[1].textContent = it.main; row.children[2].textContent = it.sub;
    row.onmousedown = (e) => e.preventDefault(); // keep focus in the address bar
    row.onclick = () => chooseSuggestion(it);
    return row;
  }));
}
function closeSuggestions() { sugItems = []; sugIndex = -1; paintSuggestions(); }
function chooseSuggestion(it) { closeSuggestions(); navigate(tabs.get(active), it.search ? it.main : it.url); address.blur(); }
address.addEventListener("input", () => { sugItems = buildSuggestions(address.value); sugIndex = -1; paintSuggestions(); });
address.addEventListener("keydown", (e) => {
  if (!sugItems.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const n = sugItems.length + 1; // -1 means "what you typed"
    sugIndex = ((sugIndex + 1 + (e.key === "ArrowDown" ? 1 : -1)) % n + n) % n - 1;
    paintSuggestions();
  } else if (e.key === "Escape") { closeSuggestions(); }
});
address.addEventListener("blur", () => setTimeout(closeSuggestions, 100));
$("address-form").onsubmit = (e) => {
  e.preventDefault();
  if (sugIndex >= 0 && sugItems[sugIndex]) return chooseSuggestion(sugItems[sugIndex]);
  closeSuggestions();
  if (address.value.trim()) { navigate(tabs.get(active), address.value); address.blur(); }
};
address.addEventListener("focus", () => address.select());
const win = () => tabs.get(active)?.iframe.contentWindow;
$("back").onclick = () => win()?.history.back();
$("forward").onclick = () => win()?.history.forward();
function reloadActive() {
  const tab = tabs.get(active);
  const b = $("reload").firstElementChild;
  b.classList.remove("spin"); void b.offsetWidth; b.classList.add("spin");
  setLoading(tab, true);
  win()?.location.reload();
}
$("reload").onclick = () => { // while a page is loading, this button stops it instead
  const tab = tabs.get(active);
  if (tab.loading) { try { win()?.stop(); } catch {} setLoading(tab, false); return; }
  reloadActive();
};
$("home-btn").onclick = () => navigate(tabs.get(active), "silicon://newtab");
$("bookmark-btn").onclick = toggleBookmark;
addEventListener("storage", (e) => { if (e.key === BM_KEY || e.key === null) { paintBookmark(); renderBookmarkBar(); } }); // edited on silicon://bookmarks

renderBookmarkBar();

// Start with a new tab. Deep link: /?url=... (also where /proxy/https://site redirects to)
const initial = new URLSearchParams(location.search).get("url");
if (initial) history.replaceState(null, "", "/");
openTab(initial || "silicon://newtab");
