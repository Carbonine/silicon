import type { ScramjetFrame, Settings } from "./types";

// The proxy engine is the backend's own browser module, loaded at runtime rather than bundled, so the Scramjet
// plugins (new-tab links, download fix and so on) keep one copy shared with the old frontend.
interface ProxyClient {
  init(s: Settings): Promise<void>;
  setTransport(s: Settings): Promise<void>;
  defaultWisp(): string;
  createFrame(iframe: HTMLIFrameElement, onUrl: ((url: string) => void) | null, onWindow: ((win: Window) => void) | null, options?: { fixHtml?: boolean; onOpen?: (url: string) => void }): ScramjetFrame;
}

const loadClient = (): Promise<ProxyClient> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "/js/proxy-client.js" as string) as Promise<ProxyClient>;

// A host that can't forward WebSockets sets this at build time. A Wisp URL chosen in Settings still wins.
const withWisp = (s: Settings): Settings => ({ ...s, wisp: s.wisp || process.env.NEXT_PUBLIC_WISP_URL || "" });

let booting: Promise<ProxyClient> | null = null;
export function bootEngine(s: Settings): Promise<ProxyClient> {
  booting ??= loadClient().then(async (client) => { await client.init(withWisp(s)); return client; }).catch((err) => { booting = null; throw err; });
  return booting;
}
export const updateTransport = async (s: Settings): Promise<void> => { if (booting) await (await booting).setTransport(withWisp(s)); };
