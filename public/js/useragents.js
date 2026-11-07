// Browser identities Silicon can present to the sites you open through the proxy. Shared by the proxy engine
// (proxy-client.js, which applies one) and by both versions of Settings (which list them).
//
// When browsers move on, update the three version numbers below and nothing else. Chrome and Edge only report
// their major version (the rest is always "0.0.0"), and Safari's number is its marketing version.
const CHROME = 157, FIREFOX = 159, SAFARI = "26.6";

const WIN = "Windows NT 10.0; Win64; x64", MAC = "Macintosh; Intel Mac OS X 10_15_7", LINUX = "X11; Linux x86_64", ANDROID = "Linux; Android 10; K";
const chrome = (platform, mobile) => `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME}.0.0.0 ${mobile ? "Mobile " : ""}Safari/537.36`;
const edge = (platform) => `${chrome(platform)} Edg/${CHROME}.0.0.0`;
const firefox = (platform) => `Mozilla/5.0 (${platform}; rv:${FIREFOX}.0) Gecko/20100101 Firefox/${FIREFOX}.0`;
const safariMac = `Mozilla/5.0 (${MAC}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${SAFARI} Safari/605.1.15`;
const safariPhone = `Mozilla/5.0 (iPhone; CPU iPhone OS ${SAFARI.replace(".", "_")} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${SAFARI} Mobile/15E148 Safari/604.1`;

// engine "chromium" browsers also send client hints and have navigator.userAgentData; Firefox and Safari have neither.
const CR = { engine: "chromium", vendor: "Google Inc.", brand: "Google Chrome" };
const ED = { engine: "chromium", vendor: "Google Inc.", brand: "Microsoft Edge" };
const FX = { engine: "gecko", vendor: "" };
const SF = { engine: "webkit", vendor: "Apple Computer, Inc." };

export const USER_AGENTS = [
  { id: "chrome-win", group: "Chrome", label: "Chrome on Windows", ua: chrome(WIN), platform: "Win32", uad: ["Windows", "10.0.0", "x86", false], ...CR },
  { id: "chrome-mac", group: "Chrome", label: "Chrome on Mac", ua: chrome(MAC), platform: "MacIntel", uad: ["macOS", "15.0.0", "arm", false], ...CR },
  { id: "chrome-linux", group: "Chrome", label: "Chrome on Linux", ua: chrome(LINUX), platform: "Linux x86_64", uad: ["Linux", "6.8.0", "x86", false], ...CR },
  { id: "chrome-android", group: "Chrome", label: "Chrome on Android", ua: chrome(ANDROID, true), platform: "Linux armv81", uad: ["Android", "10.0.0", "", true], ...CR },
  { id: "edge-win", group: "Edge", label: "Edge on Windows", ua: edge(WIN), platform: "Win32", uad: ["Windows", "10.0.0", "x86", false], ...ED },
  { id: "edge-mac", group: "Edge", label: "Edge on Mac", ua: edge(MAC), platform: "MacIntel", uad: ["macOS", "15.0.0", "arm", false], ...ED },
  { id: "firefox-win", group: "Firefox", label: "Firefox on Windows", ua: firefox(WIN), platform: "Win32", ...FX },
  { id: "firefox-mac", group: "Firefox", label: "Firefox on Mac", ua: firefox("Macintosh; Intel Mac OS X 10.15"), platform: "MacIntel", ...FX },
  { id: "firefox-linux", group: "Firefox", label: "Firefox on Linux", ua: firefox(LINUX), platform: "Linux x86_64", ...FX },
  { id: "firefox-android", group: "Firefox", label: "Firefox on Android", ua: `Mozilla/5.0 (Android 15; Mobile; rv:${FIREFOX}.0) Gecko/${FIREFOX}.0 Firefox/${FIREFOX}.0`, platform: "Linux armv81", ...FX },
  { id: "safari-mac", group: "Safari", label: "Safari on Mac", ua: safariMac, platform: "MacIntel", ...SF },
  { id: "safari-iphone", group: "Safari", label: "Safari on iPhone", ua: safariPhone, platform: "iPhone", ...SF },
];
const byId = new Map(USER_AGENTS.map((p) => [p.id, p]));

// A custom user agent is sent as typed. Printable ASCII only, so it can't smuggle anything else into a header.
export const validUserAgent = (s) => /^[\x20-\x7e]{1,300}$/.test(String(s ?? "").trim());

/**
 * What to present for these settings ({ userAgent, customUserAgent }), or null to leave the browser's own identity alone.
 * { ua, platform?, vendor?, engine?, hints?: { "sec-ch-ua": ..., }, brands?, uad? }
 */
export function identityFor(settings) {
  const id = settings?.userAgent || "default";
  if (id === "custom") {
    const ua = String(settings.customUserAgent ?? "").trim();
    return validUserAgent(ua) ? { ua, engine: "custom" } : null; // no hints: a custom string can't say what it is
  }
  const p = byId.get(id);
  if (!p) return null;
  if (p.engine !== "chromium") return { ua: p.ua, platform: p.platform, vendor: p.vendor, engine: p.engine };
  const [osName, osVersion, arch, mobile] = p.uad;
  const brands = [{ brand: "Chromium", version: String(CHROME) }, { brand: p.brand, version: String(CHROME) }, { brand: "Not-A.Brand", version: "24" }];
  return {
    ua: p.ua, platform: p.platform, vendor: p.vendor, engine: "chromium", brands, uad: { osName, osVersion, arch, mobile },
    hints: {
      "sec-ch-ua": brands.map((b) => `"${b.brand}";v="${b.version}"`).join(", "),
      "sec-ch-ua-mobile": mobile ? "?1" : "?0",
      "sec-ch-ua-platform": `"${osName}"`,
    },
  };
}

/** Rewrites a request's headers (an array of [name, value]) to carry the identity. */
export function applyToHeaders(headers, id) {
  const kept = headers.filter(([k]) => { const l = k.toLowerCase(); return l !== "user-agent" && !l.startsWith("sec-ch-ua"); });
  kept.push(["user-agent", id.ua]);
  if (id.hints) for (const [k, v] of Object.entries(id.hints)) kept.push([k, v]);
  return kept;
}

/** Makes a page read the identity from navigator. Runs in each window before the page's own scripts. */
export function applyToWindow(win, id) {
  const proto = win.Navigator?.prototype;
  if (!proto) return;
  const set = (name, value) => { try { Object.defineProperty(proto, name, { get: () => value, configurable: true, enumerable: true }); } catch {} };
  set("userAgent", id.ua);
  set("appVersion", id.ua.replace(/^Mozilla\//, ""));
  if (id.platform) set("platform", id.platform);
  if (id.vendor !== undefined) set("vendor", id.vendor);
  if (id.engine === "chromium") {
    const data = { brands: id.brands, mobile: id.uad.mobile, platform: id.uad.osName };
    const full = id.brands.map((b) => ({ brand: b.brand, version: `${b.version}.0.0.0` }));
    set("userAgentData", {
      ...data,
      getHighEntropyValues: () => Promise.resolve({ ...data, architecture: id.uad.arch, bitness: id.uad.arch ? "64" : "", model: "", platformVersion: id.uad.osVersion, uaFullVersion: full[1].version, fullVersionList: full, wow64: false }),
      toJSON: () => data,
    });
  } else set("userAgentData", undefined); // Firefox, Safari and a custom string have none
}
