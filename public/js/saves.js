// Game saves. A site loaded through the proxy keeps its data in this browser, under names that include the site it belongs to:
// localStorage keys look like "example.com@save1" and IndexedDB databases like "https://example.com@GameDB". Many games keep their
// saves in one or both. This reads them out into a file, and puts them back (merging into what's there).
// The full backup in Settings only covers localStorage, so IndexedDB saves need this.
const LS_RE = /^([a-z0-9-]+(?:\.[a-z0-9-]+)*(?::\d+)?)@(.+)$/i; // "example.com@save1"
const IDB_RE = /^(https?:\/\/[^@]+)@(.+)$/;                      // "https://example.com@GameDB"
const MAX_BYTES = 200 * 1024 * 1024; // refuse to build files bigger than this
const BINARY = new Set(["Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array"]);

const req = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
function openDb(name, version, upgrade) {
  return new Promise((ok, no) => {
    const r = version ? indexedDB.open(name, version) : indexedDB.open(name);
    if (upgrade) r.onupgradeneeded = () => upgrade(r.result, r.transaction);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
    r.onblocked = () => no(new Error("a game tab is using it. Close game tabs and try again"));
  });
}
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// ---- Turning values into JSON and back. Saves are often binary (typed arrays, blobs), which plain JSON can't hold.
async function enc(v, st, depth = 0) {
  if (depth > 60) throw new Error("a save is nested too deeply to export");
  if (v === null || typeof v === "boolean" || typeof v === "string") { st.n += typeof v === "string" ? v.length : 5; return v; }
  if (typeof v === "number") return Number.isFinite(v) ? v : { $t: "n", v: String(v) };
  if (typeof v === "bigint") return { $t: "big", v: String(v) };
  if (v === undefined) return { $t: "u" };
  if (v instanceof Date) return { $t: "d", v: v.getTime() };
  const bin = (u8) => { st.n += Math.ceil(u8.length * 4 / 3); if (st.n > MAX_BYTES) throw new Error("these saves are too large to export (over 200 MB)"); return b64(u8); };
  if (v instanceof ArrayBuffer) return { $t: "ab", v: bin(new Uint8Array(v)) };
  if (ArrayBuffer.isView(v)) {
    const c = v.constructor.name;
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    return v instanceof DataView ? { $t: "dv", v: bin(bytes) } : BINARY.has(c) ? { $t: "ta", c, v: bin(bytes) } : (() => { throw new Error("a save holds a kind of data that can't be exported"); })();
  }
  if (v instanceof Blob) return { $t: v instanceof File ? "file" : "blob", m: v.type, n: v instanceof File ? v.name : undefined, v: bin(new Uint8Array(await v.arrayBuffer())) };
  if (v instanceof Map) { const out = []; for (const [k, x] of v) out.push([await enc(k, st, depth + 1), await enc(x, st, depth + 1)]); return { $t: "map", v: out }; }
  if (v instanceof Set) { const out = []; for (const x of v) out.push(await enc(x, st, depth + 1)); return { $t: "set", v: out }; }
  if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await enc(x, st, depth + 1)); return out; }
  if (typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v)) out[k] = await enc(v[k], st, depth + 1);
    return "$t" in out ? { $t: "o", v: out } : out; // an object that has its own "$t" gets wrapped so it can't be mistaken for a tag
  }
  throw new Error("a save holds a kind of data that can't be exported");
}
function dec(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(dec);
  switch (v.$t) {
    case undefined: { const o = {}; for (const k of Object.keys(v)) o[k] = dec(v[k]); return o; }
    case "n": return Number(v.v);
    case "big": return BigInt(v.v);
    case "u": return undefined;
    case "d": return new Date(v.v);
    case "ab": return unb64(v.v).buffer;
    case "dv": return new DataView(unb64(v.v).buffer);
    case "ta": if (!BINARY.has(v.c)) throw new Error("the file has data it can't read"); return new globalThis[v.c](unb64(v.v).buffer);
    case "blob": return new Blob([unb64(v.v)], { type: v.m || "" });
    case "file": return new File([unb64(v.v)], v.n || "file", { type: v.m || "" });
    case "map": return new Map(v.v.map(([k, x]) => [dec(k), dec(x)]));
    case "set": return new Set(v.v.map(dec));
    case "o": { const o = {}; for (const k of Object.keys(v.v)) o[k] = dec(v.v[k]); return o; }
    default: throw new Error("the file has data it can't read");
  }
}

// ---- What is saved right now: { host, localStorage: [keys], databases: [{ name, db, version, records }] } per site
export async function scan() {
  const sites = new Map();
  const site = (h) => { if (!sites.has(h)) sites.set(h, { host: h, localStorage: [], databases: [] }); return sites.get(h); };
  for (const k of Object.keys(localStorage)) { const m = LS_RE.exec(k); if (m) site(m[1]).localStorage.push(k); }
  let dbs = []; try { dbs = (await indexedDB.databases?.()) || []; } catch {}
  for (const d of dbs) {
    const m = IDB_RE.exec(d.name || "");
    if (!m) continue; // Silicon's own databases (no site in the name) are left out
    let records = 0;
    try { const db = await openDb(d.name); try { const names = [...db.objectStoreNames]; if (names.length) { const tx = db.transaction(names, "readonly"); for (const n of names) records += await req(tx.objectStore(n).count()); } } finally { db.close(); } } catch {}
    site(m[1].replace(/^https?:\/\//, "")).databases.push({ name: d.name, db: m[2], version: d.version, records });
  }
  return [...sites.values()].filter((s) => s.localStorage.length || s.databases.length).sort((a, b) => a.host.localeCompare(b.host));
}

// ---- Export. selection = { ls: Set of localStorage keys, db: Set of database names }
async function dumpDb(name) {
  const db = await openDb(name);
  try {
    const names = [...db.objectStoreNames];
    const raw = [];
    if (names.length) {
      const tx = db.transaction(names, "readonly");
      await Promise.all(names.map(async (sn) => {
        const st = tx.objectStore(sn);
        const [keys, vals] = await Promise.all([req(st.getAllKeys()), req(st.getAll())]);
        raw.push({ name: sn, keyPath: st.keyPath, autoIncrement: st.autoIncrement, keys, vals, indexes: [...st.indexNames].map((i) => { const ix = st.index(i); return { name: i, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry }; }) });
      }));
    }
    return { version: db.version, raw };
  } finally { db.close(); }
}
export async function buildExport(sel) {
  const out = { app: "silicon", kind: "game-saves", format: 1, exportedAt: new Date().toISOString(), sites: {} };
  const st = { n: 0 };
  const site = (h) => (out.sites[h] ||= { localStorage: {}, indexedDB: [] });
  for (const k of sel.ls) { const m = LS_RE.exec(k); if (m) { const v = localStorage.getItem(k); if (v !== null) { site(m[1]).localStorage[m[2]] = v; st.n += v.length; } } }
  for (const name of sel.db) {
    const m = IDB_RE.exec(name); if (!m) continue;
    const { version, raw } = await dumpDb(name);
    const stores = [];
    for (const r of raw) {
      const records = [];
      for (let i = 0; i < r.keys.length; i++) records.push([await enc(r.keys[i], st), await enc(r.vals[i], st)]);
      stores.push({ name: r.name, keyPath: r.keyPath, autoIncrement: r.autoIncrement, indexes: r.indexes, records });
    }
    site(m[1].replace(/^https?:\/\//, "")).indexedDB.push({ origin: m[1], name: m[2], version, stores });
  }
  return JSON.stringify(out);
}

// ---- Import
// Returns the sites in a saves file, as the same shape scan() gives (so the same list can be shown), or throws a readable error.
export function parseFile(text) {
  if (text.length > MAX_BYTES * 1.5) throw new Error("That file is too large.");
  let o; try { o = JSON.parse(text); } catch { throw new Error("That file isn't valid JSON."); }
  if (!o || o.app !== "silicon" || o.kind !== "game-saves" || typeof o.sites !== "object" || !o.sites) throw new Error("That isn't a Silicon game saves file. (A full backup goes in Import data above.)");
  if (o.format > 1) throw new Error("This file is from a newer version of Silicon.");
  const sites = [];
  for (const [host, s] of Object.entries(o.sites)) {
    if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) throw new Error("The file has an entry Silicon can't read.");
    const ls = Object.keys(s.localStorage || {});
    for (const k of ls) if (typeof s.localStorage[k] !== "string") throw new Error("The file has an entry Silicon can't read.");
    sites.push({ host, localStorage: ls.map((k) => `${host}@${k}`), databases: (s.indexedDB || []).map((d) => ({ name: `${d.origin}@${d.name}`, db: d.name, version: d.version, records: (d.stores || []).reduce((n, x) => n + (x.records?.length || 0), 0) })), _raw: s });
  }
  return sites;
}
async function restoreDb(dump, fullName) {
  const probe = await openDb(fullName);
  const have = new Set(probe.objectStoreNames), ver = probe.version, fresh = !have.size;
  probe.close();
  const create = (db, stores) => { for (const s of stores) { const store = db.createObjectStore(s.name, s.keyPath != null ? { keyPath: s.keyPath, autoIncrement: !!s.autoIncrement } : { autoIncrement: !!s.autoIncrement }); for (const ix of s.indexes || []) store.createIndex(ix.name, ix.keyPath, { unique: !!ix.unique, multiEntry: !!ix.multiEntry }); } };
  let db;
  const missing = dump.stores.filter((s) => !have.has(s.name));
  if (fresh) { // nothing there: make it at the version the game used, so the game opens it normally
    await new Promise((ok, no) => { const r = indexedDB.deleteDatabase(fullName); r.onsuccess = ok; r.onerror = () => no(r.error); r.onblocked = () => no(new Error("a game tab is using it. Close game tabs and try again")); });
    db = await openDb(fullName, Math.max(1, dump.version || 1), (d) => create(d, dump.stores));
  } else if (missing.length) { // it exists but lacks some stores: one version up is the only way to add them
    db = await openDb(fullName, ver + 1, (d) => create(d, missing));
  } else db = await openDb(fullName);
  try {
    const decoded = dump.stores.map((s) => ({ s, recs: s.records.map(([k, v]) => [dec(k), dec(v)]) }));
    const names = decoded.map((d) => d.s.name);
    if (!names.length) return;
    const tx = db.transaction(names, "readwrite");
    const done = new Promise((ok, no) => { tx.oncomplete = ok; tx.onerror = () => no(tx.error); tx.onabort = () => no(tx.error || new Error("the browser refused the data")); });
    for (const { s, recs } of decoded) {
      const store = tx.objectStore(s.name);
      for (const [k, v] of recs) { if (store.keyPath != null) store.put(v); else store.put(v, k); }
    }
    await done;
  } finally { db.close(); }
}
// sel as for buildExport. Returns { sites, items } counts, and a list of problems.
export async function importSaves(sites, sel) {
  let items = 0; const problems = [], touched = new Set();
  for (const s of sites) {
    for (const key of s.localStorage) {
      if (!sel.ls.has(key)) continue;
      try { localStorage.setItem(key, s._raw.localStorage[key.slice(s.host.length + 1)]); items++; touched.add(s.host); } catch { problems.push(`${key}: the browser has no room to store it`); }
    }
    for (const d of s._raw.indexedDB || []) {
      const full = `${d.origin}@${d.name}`;
      if (!sel.db.has(full)) continue;
      try { await restoreDb(d, full); items++; touched.add(s.host); } catch (e) { problems.push(`${d.name} (${s.host}): ${e.message || e}`); }
    }
  }
  return { sites: touched.size, items, problems };
}
