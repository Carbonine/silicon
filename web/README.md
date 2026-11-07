# Silicon web (v0.3 frontend)

The Next.js (App Router, TypeScript, Tailwind CSS) version of Silicon's frontend. The Express backend in the folder above is unchanged and still owns the proxy, the Wisp server and the game and icon APIs. The old frontend in `../public` keeps working until this one replaces it.

## Running it

Needs Node.js 20.9 or newer. Run the backend and the frontend side by side:

```sh
npm install
npm run dev
```

```sh
cd web
npm install
npm run dev
```

Open <http://localhost:3001>. The backend stays on port 3000. For production, use `npm run build` and `npm start` in `web/`.

| Variable | Default | What it does |
| --- | --- | --- |
| `BACKEND_URL` | `http://127.0.0.1:3000` | Where the Express backend runs. Read at build time, so rebuild after changing it |
| `NEXT_PUBLIC_WISP_URL` | empty | Connect straight to this Wisp server instead of through Next. A Wisp server set in Settings still wins |

## How it fits together

- **Networking.** `next.config.ts` forwards `/proxy`, `/wisp`, `/scram`, `/epoxy`, `/libcurl`, `/api`, `/vendor`, `/css` and `/js` to Express. `/wisp/` has its own rule because Express only accepts the path with its trailing slash.
- **Service worker.** `scripts/sync-sw.mjs` copies `../public/sw.js` unchanged into `public/` before `dev` and `build`, so there is one version of it. `next.config.ts` adds its headers. The copy is ignored by git.
- **Browser identities.** The user agent presets come from the backend's `/js/useragents.js`, shared with the old frontend, and are applied by `/js/proxy-client.js`.
- **Proxy engine.** `lib/engine.ts` loads the backend's `/js/proxy-client.js` at runtime, so the Scramjet plugins aren't duplicated.
- **Tabs.** `context/TabContext.tsx` holds tabs in memory. A tab's `nav.nonce` only changes when something asks it to load an address. A page reporting its own URL updates `url` without reloading.
- **Keeping tabs alive.** `components/TabViewport.tsx` renders every tab and hides inactive ones with `hidden`. Frames render in creation order, not strip order, because moving an iframe in the DOM reloads it.
- **Back and forward.** Each tab keeps its own list of addresses in `TabViewport.tsx`, and Back loads the previous one. The browser's history can't be used: all frames share one timeline, so `history.back()` and the Navigation API can rewind other tabs, which reloads them. Going back loads the page fresh, so scroll position and form contents aren't restored.
- **`silicon://` pages.** `lib/protocol.ts` maps addresses to routes, such as `silicon://games` to `/silicon/games`. `silicon://play?game=x` and `silicon://play/x` both open `/silicon/play/x`. These pages run inside a tab's iframe and reach the shell through `window.parent.silicon`.
- **Games.** One template, `/silicon/play/[id]`, reads each game from the live `/api/games/:id`. Games are fetched live and never stored.

## Storage

Nothing about the stored data changes: `lib/storage.ts` uses the same localStorage keys and shapes as the old frontend.

- Read and write through `useLocalStorage`, or `useSettings` for settings. Never touch `localStorage` while rendering: the server has none, and the first render must match it, so the stored value arrives in an effect.
- `storage` events keep the shell and every `silicon://` page in step, because each page runs in its own iframe.
- Code that runs outside React, such as `recordVisit`, uses `readJson` and `writeJson`, which guard against blocked storage.
- Game saves stay as they are. They are written by the games into this origin's localStorage and IndexedDB, and Settings loads `/js/saves.js` at runtime, the same way as the proxy engine.

**localStorage belongs to one origin.** A move from `localhost:3000` to `localhost:3001`, or to a new domain, starts with empty data. Use Export data on the old address and import it on the new one. Game saves need their own export. Keeping the same domain and putting Next in front of the backend avoids this.

## Hosting on Vercel, Netlify or similar

Treat this as untested. It needs three things:

1. A backend the host can reach, set in `BACKEND_URL`.
2. A WebSocket route to it. Don't rely on the host forwarding WebSockets through a rewrite. Set `NEXT_PUBLIC_WISP_URL` to the backend's `wss://` address, so browsers connect to it directly.
3. Access control on the backend. The Wisp endpoint then has a public address, and anyone who finds it can use your server.

Even so, browsers connect to the backend's own address, so a network that blocks that address breaks the proxy whatever hosts the frontend. A static frontend also doesn't change the backend's IP address. Check the host's terms and acceptable use policy first.

## Differences from the old frontend

Everything has been ported. These small things behave differently or were left out:

- Tabs have no open and close animation, and proxied pages don't fade in.
- A failed `silicon://` page name opens the new tab page if it comes from a link. Typed into the address bar, it shows "Unknown page", as before.
- Games hosted by this server open from the game player. Typing a path such as `/games/foo` into the address bar searches for it.
- Reordering a tab doesn't move its frame, as explained above.

## Styling

The shell and the `silicon://` pages use the backend's `/css/style.css` and `/css/pages.css`, so they look the same as the old frontend, with Tailwind for the rest. If the old frontend is removed, move those two files and `theme.css` into `web/` first, or restyle the pages in Tailwind.
