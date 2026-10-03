// Browser-side proxy adapter. The UI only uses: init(settings), setTransport(settings), createFrame(iframe, onUrl).
// To use another engine, reimplement this file (and sw.js / server/proxy.js).

let controller, cfg, swReg;

const load = (src) => new Promise((resolve, reject) => {
  const s = document.createElement("script");
  s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Failed to load " + src));
  document.head.appendChild(s);
});

const TRANSPORTS = { epoxy: "/epoxy/index.mjs", libcurl: "/libcurl/index.mjs" };

export const defaultWisp = () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${cfg?.wispPath ?? "/wisp/"}`;

async function buildTransport(s) {
  const Transport = (await import(TRANSPORTS[s.transport] || TRANSPORTS.epoxy)).default;
  const options = { wisp: s.wisp || defaultWisp() };
  if (s.proxy && s.transport === "libcurl") options.proxy = s.proxy; // upstream SOCKS5/HTTP proxy
  const t = new Transport(options);
  if (typeof t.init === "function") await t.init();
  return t;
}

async function registerWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers are not supported in this browser.");
  // localhost / 127.0.0.1 count as secure contexts; plain http on a LAN IP does not.
  if (!window.isSecureContext) throw new Error("Service workers need a secure context. Use http://localhost:PORT or HTTPS.");
  swReg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const sw = navigator.serviceWorker;
  if (!sw.controller) {
    // "ready" only means the worker is active; the page isn't controlled until it claims us.
    const controlled = new Promise((resolve) => sw.addEventListener("controllerchange", resolve, { once: true }));
    swReg.active?.postMessage("claim"); // covers a hard refresh
    await Promise.race([controlled, new Promise((r) => setTimeout(r, 3000))]);
  }
  if (!sw.controller) throw new Error("The proxy service worker isn't controlling this page. Reload Silicon and try again.");
}

export async function init(settings) {
  cfg = await (await fetch("/proxy-config.json")).json();
  await registerWorker();
  // Order matters: Scramjet, then the controller, then the plugins.
  await load("/scram/scramjet.js");
  await load("/scram/controller.api.js");
  await load("/scram/scramjet-utils.js");

  const transport = await buildTransport(settings);
  const { Controller } = $scramjetController;
  const { defaultConfig } = $scramjet;
  controller = new Controller({
    serviceworker: navigator.serviceWorker.controller ?? swReg.active,
    transport,
    config: {
      prefix: cfg.prefix,
      scramjetPath: "/scram/scramjet.js",
      wasmPath: "/scram/scramjet.wasm",
      injectPath: "/scram/controller.inject.js",
    },
    scramjetConfig: {
      ...defaultConfig,
      flags: { ...defaultConfig.flags, allowFailedIntercepts: true, allowInvalidJs: true },
    },
  });
  await Promise.race([
    controller.wait(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Scramjet controller handshake timed out")), 15000)),
  ]);
}

// Swap the transport (e.g. after changing Settings) without rebuilding tabs.
export async function setTransport(settings) {
  if (controller) controller.setTransport(await buildTransport(settings));
}

export function createFrame(iframe, onUrl, onWindow, { fixHtml = false, onOpen } = {}) {
  const u = $scramjetUtils;
  const plugins = [
    new u.HttpCachePlugin(),
    new u.UrlWatcherPlugin((url) => onUrl?.(url)),
    // Links that would open outside the frame (target=_blank, window.open) go to a new Silicon tab instead.
    new u.CatchEscapedLinksPlugin((url) => new URL("/?url=" + encodeURIComponent(url.href), location.origin)),
  ];
  if (onWindow) {
    // Runs inside every proxied window (including sub-frames) before the page's own scripts do,
    // so shell-level shortcuts like the panic key can't be swallowed by the page.
    class WindowHook extends u.ManagedPlugin {
      constructor() { super("silicon-window-hook", []); }
      install(frame) { this.tap(frame.hooks.init.pre, (ctx) => onWindow(ctx.window)); }
    }
    plugins.push(new WindowHook());
  }
  if (onOpen) {
    // target=_blank links and window.open() would otherwise open a whole new browser window with another
    // copy of Silicon (see CatchEscapedLinksPlugin above, which stays as the fallback). Open a tab instead.
    class OpenInTab extends u.ManagedPlugin {
      constructor() { super("silicon-open-in-tab", []); }
      install(frame) {
        this.tap(frame.hooks.init.post, (ctx) => {
          const win = ctx.window;
          const abs = (v) => { try { return new URL(String(v), ctx.client.url.href).href; } catch { return null; } };
          try {
            win.addEventListener("click", (e) => {
              if (e.defaultPrevented || e.button !== 0) return;
              const a = e.target?.closest?.("a[href], area[href]");
              const t = (a?.getAttribute("target") || "").toLowerCase();
              if (!a || !t || t === "_self" || t === "_top" || t === "_parent") return;
              const url = abs(a.href);
              if (!/^https?:/i.test(url || "")) return;
              e.preventDefault(); e.stopImmediatePropagation();
              onOpen(url);
            }, true);
          } catch {}
          const open = win.open;
          win.open = function (url, ...rest) {
            const full = url == null || url === "" ? null : abs(url);
            if (full && /^https?:/i.test(full)) { onOpen(full); return null; }
            return Reflect.apply(open, this, [url, ...rest]);
          };
        });
      }
    }
    plugins.push(new OpenInTab());
  }
  if (fixHtml) {
    // Some game hosts (GN-Math) serve their .html pages as text/plain, which a browser would show as text.
    // Mark those as HTML before Scramjet decides how to rewrite them.
    class HtmlFix extends u.ManagedPlugin {
      constructor() { super("silicon-html-fix", []); }
      install(frame) {
        this.tap(frame.hooks.fetch.preresponse, (ctx, props) => {
          const dest = ctx.parsed.destination;
          if (dest !== "iframe" && dest !== "document") return;
          if (!/\.html?$/i.test(ctx.parsed.url.pathname)) return;
          const headers = props.response?.rawHeaders;
          const ct = headers?.find(([k]) => k.toLowerCase() === "content-type");
          if (ct && /^text\/plain/i.test(ct[1])) ct[1] = "text/html; charset=utf-8";
        }, { before: ["scramjet-http-cache"] }); // must run before the cache plugin, or the original type wins
      }
    }
    plugins.push(new HtmlFix());
  }
  return controller.createFrame(iframe, { plugins });
}
