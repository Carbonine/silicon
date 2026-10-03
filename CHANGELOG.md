# Changelog

All notable changes to Silicon are listed here, newest first. **Read this before you update:** anything you need to do (a new setting, a changed environment variable, a change to saved data) is called out under the version that needs it.

Silicon is in beta, so things can change between versions.

> **Update when a new version is released, not after every commit.** Commits between releases are work in progress and may be unfinished or broken, so it is **highly recommended** to wait for a new version before updating. **Security fixes are always published as a new version,** so you won't miss one by waiting.

## Unreleased (v0.2 beta)

### Added
- Find in page (Ctrl+F, Ctrl on a Mac too): a small bar with a match count, next and previous (Enter and Shift+Enter) and Esc to close. It highlights matches without changing the page, works on proxied sites and on Silicon's own pages, ignores upper and lower case, and starts from the text you have selected.
- Zoom: Ctrl++, Ctrl+- and Ctrl+0 (Ctrl on a Mac too), from 25% to 500% in the usual steps. The level is remembered for each site, a percentage in the address bar shows when a site isn't at 100% (click it to reset), and all `silicon://` pages share one level. It scales the tab's frame with CSS, so the pages themselves aren't changed. Zoom levels are part of the saved data, so they're included in Export data.
- Alt+Left and Alt+Right go back and forward (Option on a Mac). They are ignored while you type in a text field, where they move the cursor by a word.
- Ctrl+L focuses the address bar and Ctrl+R reloads the page (Ctrl on a Mac too). Ctrl+Shift+R still hard-refreshes Silicon itself.

### Changed
- The version is now v0.2 beta.

## v0.1 beta (2026-10-02)

The first public version.

### Browsing
- Tabs: drag to reorder, duplicate, close others or tabs to the right, reopen closed tabs (the last 10), right-click menu, middle-click to close. Tabs are not saved between sessions.
- Address bar with suggestions from bookmarks, history and `silicon://` pages, matched on your device only.
- Back, forward, reload, home, a loading bar, and each tab shows the page's own icon.
- Search engines: DuckDuckGo, Google, Bing, Brave, Startpage, Ecosia, Wikipedia, Yandex, or your own.
- Dark, light and system themes.
- New tab page with shortcuts (each shows the site's own icon, fetched by your server).
- Three-dots menu with bookmarks, history, settings and a keyboard shortcuts guide.
- Keyboard shortcuts for tabs, bookmarks, history and the bookmarks bar.
- A "Can't reach this site" page for sites that fail to load, with Reload, Try the other transport and Home.

### Bookmarks and history
- Bookmark button (Ctrl+D), a bookmarks bar under the address bar, and a manager at `silicon://bookmarks` with add, edit, reorder, search and delete.
- History at `silicon://history`, grouped by day, with search, removal and clearing by time range. Can be turned off.

### Games
- A live game library fed by Selenite, GN-Math, Truffled, Seraph, CKV and Wasm.RIP (and games hosted by your own server). Nothing is stored; each source is read live and refreshed in the background.
- One source at a time, biggest first, with search, categories, sorting, favorites and "continue playing".
- A game player with refresh, fullscreen, and a shield button to load a game through the proxy or directly.

### Privacy and stealth
- Panic key, tab cloak (Google, Wikipedia, GitHub, Khan Academy, Canvas, Notion, Quizlet, or your own), `about:blank` and blob cover windows, auto cover, and confirm-before-leaving.

### Your data
- Export and import a full backup, game saves export and import (including IndexedDB saves), and a danger zone to clear data or reset settings.

### Proxy
- Scramjet 2 with the Epoxy or libcurl transport, an optional upstream SOCKS5 or HTTP proxy, and support for a different Wisp server.

### Project
- AGPL-3.0 license, README with setup, server deployment and troubleshooting notes, and this changelog.
