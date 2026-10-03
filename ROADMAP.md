# Roadmap

Features planned for Silicon after the current beta. Nothing here is built yet, and none of it is a promise or a schedule: it's the direction, in rough priority order. Shipped changes are listed in the [changelog](CHANGELOG.md).

Silicon is meant to stay simple, so each item should arrive as a setting that is off or sensible by default, not as extra clutter in the interface.

## Real proxy IPs

Today, sites you visit see the IP address of the machine running Silicon. This would let the server send traffic out through an upstream proxy (HTTP or SOCKS), so sites see that proxy's address instead.

- Configurable in two places, for different reasons:
  - **By the host, in `.env`:** a default proxy for everyone using that instance, for example to keep the server's own address hidden.
  - **By the user, in Settings:** your own proxy, for example when the VPS's IP address is flagged as a datacenter and some sites block or challenge it. A residential or mobile proxy of your own gets around that without changing the host's setup.
- If both are set, the user's choice takes priority, and the host can switch user-supplied proxies off if it doesn't want them.
- Useful for hosting Silicon at home or on a VPS whose address you'd rather not expose, or for choosing where traffic appears to come from.
- Open questions: how the Wisp server hands traffic to the upstream proxy, what happens when the upstream is down (fail closed, never silently fall back to the host's IP), how to keep the host's credentials out of the browser, and how to store a user's own proxy credentials safely (kept in their browser and sent only over the secure connection to the server, never saved there).

## Ad blocking

Block ads and trackers inside proxied pages, both for cleaner pages and for faster loads.

- Block requests at the proxy using a standard filter list (such as EasyList), and hide leftover empty ad slots.
- A global on/off switch in Settings, with a per-site exception for pages that break.
- The list is fetched and refreshed on the server, not bundled, in line with how game sources work.
- Open questions: how much cosmetic filtering is worth the added complexity, and how to keep matching fast on large lists.

## Anti-fingerprinting

Make it harder for sites to recognize a visitor from the details of their browser and device, rather than from cookies.

- Normalize or add noise to the values fingerprinting scripts commonly read: canvas and WebGL output, audio, fonts, screen size, hardware concurrency, language and time zone.
- Applied inside proxied pages only. Silicon's own pages are untouched.
- Realistically this reduces fingerprinting; it can't make you anonymous, and aggressive spoofing can itself be distinctive or break sites. The README will say so plainly, and the setting will have modes (off, standard, strict) instead of a single switch.

## User agents

Choose the browser identity that sites see.

- A list of common presets (current Chrome, Firefox and Safari on desktop, plus a mobile option) and a custom string.
- Set per tab or per site, so one site can see a phone while the rest see a desktop browser.
- Applied to the request header and to `navigator.userAgent`, along with the related client-hint headers, so the two agree with each other. A mismatch is a common giveaway.
- Related to anti-fingerprinting, and the two would share the same settings area.

## Cloud gaming

Play games streamed from cloud gaming services, so full PC games run on someone else's hardware and only the video reaches your device. NVIDIA GeForce NOW is one example of such a service, not the target.

- Each service would be added on its own terms, since they differ in how they sign in, stream and detect proxies.
- Some will likely never work through a proxy. Streaming relies on WebRTC and DRM video, and sign-in flows are often strict. Silicon can only support the services that survive that, so which ones is something to find out by testing, not promise.
- The first attempt (GeForce NOW, in an earlier build) didn't work, so this needs fresh research into what's actually possible before anything is built.

## A virtual machine environment (maybe)

Run a full browser or operating system inside a tab using WebAssembly, in the way some web desktops run Firefox or a Linux system in the page itself. Sites would load inside the virtual machine rather than through the proxy rewriter.

- **Why:** very complex sites that the proxy can't rewrite reliably would behave like a normal browser, and the page would run isolated from the shell.
- **Costs:** large downloads, high CPU and memory use, slow starts, and a poor fit for phones and school-issued hardware. It also needs its own network path, which could mean a separate Wisp connection.
- **Status:** this is a "maybe" because it's a big step in weight and complexity, and may not fit Silicon's goal of staying light and simple. It would start as an experiment, likely behind a flag, before any decision.

## Not planned by default

Accounts, sync, or anything that stores personal data on the server. Silicon keeps its data in your own browser, and that stays the default.

The one exception is an opt-in for the person running a given instance:

- The host can turn on accounts and sync for their own instance. It is **off by default**, and nothing changes unless they enable it.
- It exists for convenience only, such as syncing particular settings, bookmarks or game saves between devices.
- It will not be used for tracking, profiling or fingerprinting, and it will store only what's needed for the feature to work. The README and Settings will say exactly what's stored when it's on.
- It's the host's decision for their own instance. Silicon as shipped doesn't phone home or collect anything.
