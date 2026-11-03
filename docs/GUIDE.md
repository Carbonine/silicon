# Silicon guide

The full guide to running, updating and using Silicon. For what Silicon is and how to try it in a minute, see the [README](../README.md).

## Contents

- [The Next.js frontend](#the-nextjs-frontend)
- [Running it on a server (VPS)](#running-it-on-a-server-vps)
- [Updating](#updating)
- [Configuration](#configuration)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Game sources](#game-sources)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [How it works](#how-it-works)
- [Project layout](#project-layout)

## The Next.js frontend

`web/` holds a second frontend built with Next.js, TypeScript and Tailwind CSS. It has the same features and runs alongside the backend, which doesn't change. It needs Node.js 20.9 or newer. With the server from the Quick start running, start it in a second terminal:

```sh
cd web
npm install
npm run dev
```

Then open <http://localhost:3001>. Your saved data belongs to each address, so use Settings → Data to export from `localhost:3000` and import on `localhost:3001`. See [web/README.md](../web/README.md) for how it works and what differs.

## Running it on a server (VPS)

Run Silicon on a server you rent (a VPS) when you want to use it from other devices, or want sites to see the server's connection instead of yours. These steps are for Debian or Ubuntu. Other systems work the same way, with different install commands.

**Before you start, know this:** Silicon has no login. Anyone who can reach it can send traffic out through your server. So the steps below keep it private first and open to other devices second. Use a long-running service, HTTPS and a password, as in steps 3 to 5.

### 1. Install Node.js and git

You need Node.js 18 or newer. The version in the system's package list is often older, so check:

```sh
node --version
```

If it's older than 18 (or missing), install a current one from [nodejs.org](https://nodejs.org/en/download) or with your system's package manager, then install git:

```sh
sudo apt install -y git
```

### 2. Get Silicon

This puts it in `/opt/silicon` and creates a separate user to run it, so a problem in Silicon can't touch the rest of your server:

```sh
sudo useradd --system --home /opt/silicon --shell /usr/sbin/nologin silicon
sudo git clone https://github.com/Carbonine/silicon.git /opt/silicon
sudo chown -R silicon:silicon /opt/silicon
sudo -u silicon sh -c 'cd /opt/silicon && npm install --omit=dev'
```

To run a released version and not the newest code, see [Updating](#updating) first.

### 3. Run it as a service

A service starts Silicon on boot and restarts it if it stops. Create `/etc/systemd/system/silicon.service` (for example with `sudo nano /etc/systemd/system/silicon.service`) containing:

```ini
[Unit]
Description=Silicon
After=network.target

[Service]
User=silicon
WorkingDirectory=/opt/silicon
Environment=NODE_ENV=production HOST=127.0.0.1 PORT=3000
ExecStart=/usr/bin/node server/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

If `which node` prints a different path than `/usr/bin/node`, use that path in `ExecStart`. Then start it:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now silicon
sudo systemctl status silicon
```

`HOST=127.0.0.1` means only the server itself can reach Silicon for now. That's intentional: steps 4 and 5 are how other devices get in safely. Logs are available with `journalctl -u silicon -f`.

### 4. Reach it

Pick one:

- **Just you, no domain needed: an SSH tunnel.** On your own computer run `ssh -L 3000:127.0.0.1:3000 you@your-server`, leave it open, and visit `http://localhost:3000`. Nothing is exposed to the internet, and `localhost` counts as secure, so the proxy works. This is the simplest and safest option.
- **From any device: a domain with HTTPS.** Silicon's proxy only runs on `localhost` or over HTTPS, so a plain `http://your-server` address won't work. Point a domain's DNS record at the server, open ports 80 and 443 in its firewall, and use a reverse proxy. Caddy is the easiest because it gets the HTTPS certificate for you and passes WebSockets through (see [Caddy's install guide](https://caddyserver.com/docs/install)). Put this in `/etc/caddy/Caddyfile`:

  ```
  silicon.example.com {
      basic_auth {
          yourname PASTE_HASH_HERE
      }
      reverse_proxy 127.0.0.1:3000
  }
  ```

  Replace `silicon.example.com` with your domain and `yourname` with the username you want. Make the password hash with `caddy hash-password` (it asks for the password), paste the result in place of `PASTE_HASH_HERE`, then run `sudo systemctl reload caddy`.

  With nginx instead, you must pass WebSocket upgrades through for the whole site, including `/wisp/`: `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`.

### 5. Keep other people out

The `basic_auth` block above is what keeps strangers from using your server. Don't skip it if the address is public. Alternatives are a VPN such as Tailscale or WireGuard, or firewall rules that only allow your own addresses. Never set `HOST=0.0.0.0` on a public server without one of these.

### Good to know

- **Blocked IP addresses.** Large sites often block or challenge datacenter addresses, and a VPS's address is one. If sites won't load, or ask you to prove you're human, that's usually why. Settings has an option to send traffic through a SOCKS5 or HTTP proxy of your own (libcurl transport only), which can help.
- **Private addresses are refused.** The Wisp server won't connect to loopback or private addresses, so the proxy can't be used to reach other services on your server or its network.
- **Updating.** See [Updating](#updating). On a server, the last step is `sudo systemctl restart silicon`.
- **Port in use.** If another program uses port 3000, change `PORT` in the service file (and in the Caddy address) and restart.

## Updating

Silicon doesn't update itself, and it never contacts GitHub to check. Each version is listed in the [changelog](../CHANGELOG.md) and under the repository's Releases. Upcoming work is outlined in the [roadmap](../ROADMAP.md). **It's recommended to update only when a new version is released**, not after every commit: commits in between are work in progress and may be unfinished or broken.

1. **Read the [changelog](../CHANGELOG.md)** for the versions you're skipping. Anything you have to do, such as a new setting or a change to saved data, is noted there.
2. **Optional but sensible:** in Settings → Data, press **Export data** (and **Export game saves** if you play games through the proxy) first, so you have a backup.
3. **Get the new version,** from the Silicon folder. To stay on released versions (recommended), switch to the release you want:

   ```sh
   git fetch --tags
   git checkout v0.3.0
   npm install
   ```

   Use the version number from the Releases page or the changelog. (`git tag --list --sort=-v:refname` lists every version, newest first.) Git will say you're in a "detached HEAD" state. That's normal: it just means you're on a fixed release and not on the moving latest code.

   If you'd rather follow the newest work, which is ahead of the latest release and may be unfinished, go back to the main branch and pull:

   ```sh
   git checkout main
   git pull
   npm install
   ```

   `npm install` only matters when the dependencies changed, but it's safe to run every time. If git complains about local changes, commit or stash them first.
4. **Restart the server.** If you started it with `npm run dev`, it restarts by itself when files change. With `npm start`, stop it and start it again. On a VPS, run the git commands as the `silicon` user (for example `sudo -u silicon git -C /opt/silicon fetch --tags`, then the same with `checkout` and `sudo -u silicon sh -c 'cd /opt/silicon && npm install --omit=dev'`), then restart the service with `sudo systemctl restart silicon`.
5. **Reload Silicon in your browser.** A hard refresh (Ctrl+Shift+R, or Cmd+Shift+R on a Mac) makes sure the browser isn't using old files.

Your settings, bookmarks, history, favorites and game saves are kept in your browser, not in the Silicon folder, so updating doesn't touch them. Your `.env` file is yours and isn't overwritten either; compare it with `.env.example` after an update in case a new option was added.

If you downloaded a zip instead of cloning, download the new version from the Releases page, copy your `.env` over if you made one, run `npm install`, and start it. Cloning with git is the easier way to stay up to date.

## Configuration

All optional. Copy `.env.example` to `.env` to change anything.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `HOST` | `127.0.0.1` | `127.0.0.1` = this machine only. `0.0.0.0` = anyone who can reach the machine can use the proxy |
| `PROXY_PREFIX` | `/proxy/` | URL path the proxy uses |
| `WISP_PATH` | `/wisp/` | URL path of the Wisp (WebSocket) endpoint |
| `GAMES_REFRESH_MINUTES` | `30` | How often the game lists are fetched again |
| `SELENITE_URL`, `GNMATH_URL`, `TRUFFLED_URL`, `SERAPH_URL`, `CKV_URL`, `WASMRIP_URL` | each source's own site | Use a mirror instead |

## Keyboard shortcuts

The three-dots menu has the full list. The main ones:

| Action | Keys |
| --- | --- |
| New tab / close tab | Ctrl+T, Ctrl+W (or Alt+T, Alt+W) |
| Reopen closed tab | Ctrl+Shift+T (or Alt+Shift+T) |
| Next / previous tab | Ctrl+Tab, Ctrl+Shift+Tab (or Alt+], Alt+[) |
| Go to tab 1 to 8 / last tab | Ctrl+1 to 8, Ctrl+9 (or Alt+1 to 9) |
| Back / forward | Alt+Left / Alt+Right |
| Go to the address bar / reload | Ctrl+L / Ctrl+R |
| Zoom in / out / reset | Ctrl++ / Ctrl+- / Ctrl+0 |
| Find in page | Ctrl+F |
| Bookmark this page | Ctrl+D |
| Bookmarks / bookmarks bar | Ctrl+Shift+O / Ctrl+Shift+B |
| History | Ctrl+H |
| Search a library page | `/` |

Ctrl is the key on a Mac too. On Windows and Linux, browsers usually keep the Ctrl tab shortcuts (T, W, Tab, 1 to 9) for themselves, so they only work where the browser lets them through. The Alt versions always work.

## Game sources

Games are not stored in this repository or on your disk. Each source is read live from its own site when the server starts and again every `GAMES_REFRESH_MINUTES`, and kept in memory only:

| Source | Site |
| --- | --- |
| Selenite | selenite.cc |
| GN-Math | gn-math.dev |
| Truffled | truffled.lol |
| Seraph | ijnfem.github.io/seraph |
| CKV (Chicken King's Vault) | wanocapy.github.io/ChickenKingsVault |
| Wasm.RIP | wasm.rip |
| Silicon | games hosted by this server in `public/games/` (see `public/games/games.json`). Empty by default, and hidden until you add one |

**Silicon does not host, own or control these games or sites.** It only links to them and, by default, loads them through your own server's proxy. Their content belongs to their authors and sites, and a source can change or disappear at any time. You are responsible for the sources you enable and for following the rules of the sites and networks you use.

**If a game doesn't load or doesn't work, that is usually the game's source, not Silicon.** Silicon only passes the game along. Each game is hosted by its source (and often loads its files from other sites), so a game can be broken, slow or missing no matter how you open it. A good test is the shield button in the player: if the game fails both through the proxy **and** loaded directly, the problem is on the source's side (for example the game was taken down, a file it needs is blocked, or the site is down) and Silicon can't fix it. Only a game that works one way but not the other points to a proxy problem, and that's worth reporting. Games that are known to be broken can be left out with `server/games-hidden.json`.

To add a source, write an adapter in `server/games.js` (an async function that returns a list of games) and register it in `SOURCES`.

## Troubleshooting

- **"Can't reach this site".** When a site can't be loaded, Silicon shows this page with a likely cause and three buttons: Reload, Try the other transport (Epoxy or libcurl, switched for you) and Home. "Technical details" has the raw error. If it happens on every site, the connection to the proxy itself is failing: if you're not on `localhost` make sure you're using HTTPS, and check that the server is running.
- **A game stays on its loading screen or is blank.** Press the shield button in the player to switch between the proxy and a direct load. Emulator-based games work best when loaded directly. If it fails both ways, the game itself is broken at its source (see [Game sources](#game-sources)), not something Silicon can fix.
- **Other devices on my network can't reach it.** The default `HOST=127.0.0.1` only allows this machine. Set `HOST=0.0.0.0`, and remember the proxy then works for everyone who can reach it. Service workers still need HTTPS on any address that isn't `localhost`.
- **"Address already in use".** Another program is on that port. Set a different `PORT`.
- **A game source is empty.** Its site may be down or blocked from your server. The other sources keep working, and it is fetched again at the next refresh.
- **A keyboard shortcut does nothing.** Your browser may be using it before Silicon sees it, most often Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+L or Ctrl+R on Windows and Linux. Use the Alt versions of the tab shortcuts, or the buttons on screen. The full list is in the three-dots menu.
- **A download doesn't start.** Downloads from proxied sites are saved by your browser, so check its downloads list and any download blocking. A very large file from a `download` link can fail (see [Known limitations](#known-limitations)).
- **I lost my bookmarks or settings.** They live in your browser's site data. Clearing it removes them, so use Settings → Export data for a backup.

## Known limitations

- Some sites don't work through the proxy, especially ones that need WebRTC, DRM video, heavy sign-in flows, or that detect and block proxies. Sites that refuse to be loaded in a frame can behave differently.
- Emulator-based games load their core in a background worker, which doesn't work through the proxy yet, so they default to loading directly (and may be blocked on restrictive networks).
- Games depend on their source sites. If a source is slow, rate-limited or down, its list may be empty until the next refresh. Individual games can also be broken at the source, for example when they load files from a third-party host that has gone offline or blocked them (jsDelivr currently blocks the `gn-math` asset account, so games that use it don't load). A game that fails both through the proxy and loaded directly is a source problem, not a Silicon one.
- Saved game data, bookmarks, history and settings live in your browser. Clearing site data removes them, so export your game saves if they matter. Game saves only cover games loaded through the proxy (a game loaded directly keeps its saves under its own site, which Silicon can't reach).
- Bookmarks are a flat list (no folders), and there are no accounts or sync.
- Silicon is not a full replacement for a browser: no extensions and no downloads manager. Downloads work, but a file from a `download` link is held in memory before it's saved, so very large files can fail.
- Find in page only matches text that is visible and unbroken. Text hidden on the page isn't searched, and a phrase split across formatting tags (for example `he<b>llo</b>`) isn't found.
- Only tested in recent Chromium-based browsers. Some browsers keep a few shortcuts (Ctrl+L, Ctrl+R, Ctrl++ and Ctrl+-, for example) for themselves, so they may not reach Silicon. The Alt versions of the tab shortcuts always work.
- Icons on the new tab shortcuts are found and fetched by your server from the site itself (and cached in memory for a few hours). Some sites have no icon the server can reach, and then the tile shows a globe. Tab cloak icons are loaded by your browser from the sites themselves, and the custom cloak needs an icon address you provide.

## How it works

Scramjet is service-worker based. The page's frames load `/proxy/<encoded-url>`, and the service worker (`public/sw.js`) rewrites those requests and sends them through a **Wisp** WebSocket on this server, using the **Epoxy** or **libcurl** transport. Because the rewriting happens in the browser, `curl` against a `/proxy/...` address does not return a site's page. If a request reaches Express without the worker, `/proxy/https://example.com` redirects to `/?url=https://example.com`, which starts the worker and opens the site.

Each tab is an iframe. `silicon://` pages are ordinary pages served at `/silicon/<name>`, and each tab keeps its own list of addresses for back and forward, because all the iframes on a page share one browser history. Going back loads the page again, so scroll position and form contents aren't restored.

## Project layout

```
server/index.js          Express app, static files, listen
server/proxy.js          Wisp server, Scramjet/transport assets, /proxy/ fallback
server/icons.js          Finds and serves a site's own icon for the new tab shortcuts
server/games.js          Game sources (one adapter each), API, cover passthrough
server/games-hidden.json Game ids to leave out of the library
public/sw.js             Scramjet service worker
public/index.html        The browser shell
public/js/app.js         Shell: tabs, address bar, bookmarks, menus, settings, privacy tools
public/js/proxy-client.js  Browser side of the proxy (init, transport, frames)
public/js/saves.js       Game saves export and import
public/silicon/          silicon:// pages (newtab, games, play, bookmarks, history, settings, error)
public/css/              theme.css (colors/fonts), style.css (shell), pages.css (pages)
public/games/            Games hosted by this server
web/                     The Next.js frontend
docs/GUIDE.md            This guide
docs/screenshots/        The screenshots shown in the README
CHANGELOG.md             What changed in each version
ROADMAP.md               Features planned for later
```

To add an internal page, create `public/silicon/NAME.html` with `data-silicon="NAME"` on `<html>` and add `NAME` to `INTERNAL` in `public/js/app.js`.
