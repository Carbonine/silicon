# Silicon
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
![Status: beta](https://img.shields.io/badge/status-beta-orange.svg)

An open-source browser-in-a-tab and games launcher. You run it on your own computer or server, open it in any modern browser, and get tabs, bookmarks, history and a library of browser games, with sites and games loaded through the [Scramjet](https://github.com/MercuryWorkshop/scramjet) 2 web proxy. Express + Scramjet + a Wisp server in one process, with a vanilla HTML/CSS/JS frontend and no build step.

Source code: <https://github.com/Carbonine/silicon>

> **Experimental (v0.3 beta).** Silicon is early software. Expect rough edges, missing features and things that break when a website, a game source or the proxy changes. Don't rely on it for anything important, and don't enter passwords or other sensitive data on sites you reach through it unless you trust where it is hosted. See [Known limitations](docs/GUIDE.md#known-limitations).

| | |
| --- | --- |
| ![The new tab page, with a bookmarks bar and shortcuts](docs/screenshots/newtab.png) | ![A website open through the proxy, with several tabs](docs/screenshots/browsing.png) |
| ![The games library](docs/screenshots/games.png) | ![The privacy settings](docs/screenshots/settings.png) |

*The games screenshot has the sources' cover art turned off.*

## Why use Silicon

- **You run it, so you control it.** No accounts, no ads, no analytics. Your settings, bookmarks, history and favorites stay in your own browser.
- **Browser and games in one place.** Browse the web and play games from one tab, with games from several sources collected in a single library.
- **Built for networks that block things.** Sites and games load through your own server's proxy, so a blocked game site or website can still work if your server can reach it.
- **Quick to hide.** A panic key, tab cloaking and cover windows are built in.
- **Small and simple.** One process, one `npm install`, no build step, no database. Games are fetched live and never saved to disk.
- **Free software.** AGPL-3.0, so you can read it, change it and share it.

## Features

**Browsing**
- Tabs you can drag to reorder, duplicate, close in bulk and reopen (up to the last 10 closed), with a right-click menu and middle-click to close. Tabs are not saved between sessions.
- An address bar that suggests bookmarks, history and `silicon://` pages as you type. It matches only on your device, and nothing you type is sent to a search engine until you press Enter.
- Back, forward, reload and home, a loading bar, and each tab shows the page's own icon. Back and forward grey out when there's nowhere to go, and Alt+Left and Alt+Right work too. Ctrl+L jumps to the address bar and Ctrl+R reloads.
- Links that open in a new tab, and pages that open a popup, open as a new Silicon tab next to the current one. Downloads work too.
- Zoom (Ctrl++, Ctrl+- and Ctrl+0), remembered for each site, with the zoom level shown in the address bar. All `silicon://` pages share one level.
- Find in page (Ctrl+F), with a match count, next and previous, and highlighted matches. It works on proxied sites and on Silicon's own pages, and doesn't change the page.
- A choice of search engines: DuckDuckGo, Google, Bing, Brave, Startpage, Ecosia, Wikipedia, Yandex, or your own.
- Dark, light or system theme.
- A shortcuts row on the new tab page (each shows the site's own icon), and a three-dots menu with bookmarks, history, settings and a keyboard shortcuts guide.

**Bookmarks and history**
- A star in the address bar (Ctrl+D) bookmarks a page. Bookmarks show in a bar under the address bar, with a menu for the ones that don't fit. Right-click one to edit or delete it.
- `silicon://bookmarks` is a manager: add, edit, reorder (drag or arrows), search and delete.
- `silicon://history` lists the pages you've opened by day, with search, single-entry removal and clearing by time range. Turn it off in Settings.

**Games**
- A library fed live by several sources (see [Game sources](docs/GUIDE.md#game-sources)). One source is shown at a time, biggest first, with search, category chips, sorting, favorites, "continue playing", and rows for new and popular games where a source provides them.
- A game player with refresh, fullscreen and back buttons, and a shield button that switches between loading the game through the proxy (default) and loading it directly. Your choice is remembered per game.
- Games from sources can be hidden by adding them to `server/games-hidden.json`, with a note on why.

**Privacy and stealth**
- **Panic key:** one key press sends the tab to a page of your choice, on every page.
- **Tab cloak:** the tab title and icon change to look like another site (Google, Wikipedia, GitHub, Khan Academy, Canvas, Notion, Quizlet, or your own with a title and an icon address) when the window loses focus, or all the time. Each icon is loaded from the site itself.
- **Cover windows:** open Silicon inside `about:blank`, and optionally do it automatically on the first key press from the front page.
- **Confirm before leaving:** asks before the tab is closed or reloaded.

**Your data**
- Settings, bookmarks, history and favorites live in your browser's `localStorage`. Settings has export and import for a JSON backup, plus a danger zone to clear data or reset settings.
- **Game saves:** games loaded through the proxy keep their saves in your browser (local storage and IndexedDB). Settings → Data → Game saves exports them to a file and imports them back, with a list to choose what goes in. Binary saves are supported, and cache-like databases are left unticked by default.

**Proxy**
- Scramjet 2, with the Epoxy or libcurl transport (switch in Settings), an optional upstream SOCKS5 or HTTP proxy (libcurl only), and an option to use a different Wisp server.

## Quick start

Requires [Node.js](https://nodejs.org/) 18 or newer and git.

```sh
git clone https://github.com/Carbonine/silicon.git silicon
cd silicon
npm install
npm run dev
```

Then open <http://localhost:3000>.

- `npm run dev` starts everything in one process and restarts when files change. `npm start` runs the same server without the file watcher.
- No API keys or cloud accounts are needed.
- It listens on `127.0.0.1` by default, so only your own machine can reach it. This is the recommended way to run Silicon.
- A fresh clone gives you the newest code, which can be ahead of the latest release. To run a released version instead, see [Updating](docs/GUIDE.md#updating).

## Documentation

The [guide](docs/GUIDE.md) has the details:

- [Running it on a server (VPS)](docs/GUIDE.md#running-it-on-a-server-vps), step by step
- [Updating](docs/GUIDE.md#updating) and the [changelog](CHANGELOG.md)
- [Configuration](docs/GUIDE.md#configuration) and [keyboard shortcuts](docs/GUIDE.md#keyboard-shortcuts)
- [Game sources](docs/GUIDE.md#game-sources), [troubleshooting](docs/GUIDE.md#troubleshooting) and [known limitations](docs/GUIDE.md#known-limitations)
- [How it works](docs/GUIDE.md#how-it-works) and the [project layout](docs/GUIDE.md#project-layout)
- [The Next.js frontend](docs/GUIDE.md#the-nextjs-frontend), and what's planned in the [roadmap](ROADMAP.md)

## Contributing

Bug reports, ideas and pull requests are welcome. Please open an issue first for anything big, so we can agree on it before you spend time on it.

- **Be kind:** everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Reporting a problem:** say what you did, what you expected, and what happened, plus your browser and whether you run Silicon on `localhost` or a server. For a game that won't load, try the shield button in the player first: if it fails both through the proxy and loaded directly, it's the game's source, not Silicon (see [Game sources](docs/GUIDE.md#game-sources)).
- **Changing the code:** fork the repository, make a branch, and open a pull request. Silicon is plain HTML, CSS and JavaScript with no build step and no frontend framework, so please keep it that way and match the style of the code around your change. Test by hand in a browser: run it with `npm run dev`, and try your change on both the dark and light themes. Please don't add a dependency without talking about it first.
- **Adding a game source:** write an adapter in `server/games.js` and register it in `SOURCES` (see [Game sources](docs/GUIDE.md#game-sources)). Sources are read live and kept in memory, never copied into the repository.
- **The changelog:** if your change is something users would notice, add a line to `CHANGELOG.md` under "Unreleased".
- **Licensing:** by contributing you agree that your work is released under the same AGPL-3.0 license as the rest of Silicon.

## Security

Silicon is a web proxy, so please be careful with it: run it on `localhost` or behind access control (see [Running it on a server](docs/GUIDE.md#running-it-on-a-server-vps)).

If you find a security problem, **please report it privately and don't open a public issue.** Use [**Report a vulnerability**](https://github.com/Carbonine/silicon/security/advisories/new) (on the repository page: **Security** tab, then **Report a vulnerability**). Only the maintainers can see what you send, and we can work on a fix together before anything is made public. Examples worth reporting: a way to make the server reach its own machine or a private network (the Wisp server and the icon fetcher are meant to refuse that), a way to run script in Silicon's own pages, or a way to read another user's saved data. Problems inside Scramjet, Wisp or a transport belong with [Mercury Workshop](https://github.com/MercuryWorkshop) instead, and a site or game that simply doesn't work through the proxy isn't a security issue.

Silicon is a beta, so there is no support schedule: fixes go into the latest version.

## License

Silicon is free software under the **GNU Affero General Public License v3.0** (AGPL-3.0-only). See [LICENSE](LICENSE). Copyright (C) 2026 Carbonine.

The AGPL applies to Silicon and requires that people who use a modified copy of it over a network can get that copy's source code. If you run a modified Silicon for other people, make your source available to them.

### Third-party software

Silicon is built on these projects, used under their own licenses:

| Project | License |
| --- | --- |
| [Scramjet](https://github.com/MercuryWorkshop/scramjet), scramjet-controller, scramjet-utils | AGPL-3.0 |
| Epoxy transport, libcurl transport | AGPL-3.0 |
| [wisp-js](https://github.com/MercuryWorkshop/wisp-js) | LGPL-3.0-or-later |
| proxy-transports | MIT |
| Express, compression | MIT |
| dotenv | BSD-2-Clause |
| [Material Symbols](https://github.com/marella/material-symbols) (icons) | Apache-2.0 |
| [Inter](https://rsms.me/inter/) via Fontsource (font) | SIL OFL 1.1 |

The proxy engine is by [Mercury Workshop](https://github.com/MercuryWorkshop). Silicon is not affiliated with or endorsed by them or by any of the game sources above.
