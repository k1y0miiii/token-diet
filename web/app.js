// ===========================================================================
// token-diet playground — vanilla JS + ESM. No frameworks.
//
// Token counts come from a REAL GPT-family tokenizer (gpt-tokenizer) running
// client-side — never estimates. JTF is a faithful JS port of the project's
// own reference encoder (token_diet/vendor/jtf.py), ENCODE direction.
// ===========================================================================

// ---- Real tokenizers (lazy ESM from CDN) ---------------------------------
// cl100k_base: GPT-3.5 / GPT-4.  o200k_base: GPT-4o / o-series.
const TOKENIZER_SOURCES = {
  cl100k: "https://esm.sh/gpt-tokenizer@2/encoding/cl100k_base",
  o200k: "https://esm.sh/gpt-tokenizer@2/encoding/o200k_base",
};
const encoders = {};        // { cl100k: encodeFn, o200k: encodeFn }
let activeTokenizer = "cl100k";

/** Token count of a string under the active tokenizer. */
function countTokens(s) {
  const enc = encoders[activeTokenizer];
  if (!enc || s === "") return 0;
  return enc(s).length;
}
/** Array of token id arrays -> we need the token *strings* for chips. */
function tokenStrings(s) {
  const name = activeTokenizer;
  const enc = encoders[name];
  if (!enc || s === "") return [];
  // gpt-tokenizer: encode(str) -> number[].  Decode each id back to its text.
  const ids = enc(s);
  const dec = decoders[name];
  if (dec) return ids.map((id) => dec([id]));
  // Fallback (shouldn't happen): approximate by ids count with blank text.
  return ids.map(() => "·");
}
const decoders = {}; // filled when module loads (decode fn per tokenizer)

// ===========================================================================
// PRICING — LIVE from LiteLLM's public price table (no API key needed).
//
// Cost is always priced as INPUT tokens: input-token price × token count.
// Each model maps to a real LiteLLM key; `price` is USD per 1,000,000 input
// tokens. We ship a tiny BUNDLED SNAPSHOT (confirmed LiteLLM values) for an
// instant first paint, then fetch the full LiteLLM JSON in the background,
// cache it in localStorage (~24h), and live-update the displayed $.
//
// The snapshot fixes a real error: Claude Opus 4.8 is $5/Mtok input
// (LiteLLM input_cost_per_token = 5e-06), NOT the old hardcoded $15.
// ===========================================================================
const MODELS = [
  { id: "opus", name: "Claude Opus 4.8", litellm: "claude-opus-4-8", price: 5, kind: "claude" },
  { id: "sonnet", name: "Claude Sonnet 4.6", litellm: "claude-sonnet-4-6", price: 3, kind: "claude" },
  { id: "haiku", name: "Claude Haiku 4.5", litellm: "claude-haiku-4-5", price: 1, kind: "claude" },
  { id: "gpt4o", name: "GPT-4o", litellm: "gpt-4o", price: 2.5, kind: "gpt" },
];
const PRIMARY_MODEL = "sonnet"; // drives the big "est. cost" meter
const costOf = (tokens, price) => (tokens * price) / 1e6;

// ---- LiteLLM live-pricing layer ------------------------------------------
const LITELLM_URL =
  "https://cdn.jsdelivr.net/gh/BerriAI/litellm@main/model_prices_and_context_window.json";
const PRICE_CACHE_KEY = "token-diet:litellm-prices:v1";
const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // refresh if older than ~24h
// "snapshot" = bundled defaults · "cached" = localStorage · "live" = just fetched
let priceSourceLabel = "snapshot";

/** Extract just the input-token $/Mtok for our models from a LiteLLM blob. */
function extractPrices(blob) {
  const out = {};
  for (const m of MODELS) {
    const entry = blob && blob[m.litellm];
    const perTok = entry && entry.input_cost_per_token;
    if (typeof perTok === "number" && perTok > 0) out[m.id] = perTok * 1e6;
  }
  return out;
}

/** Apply a {modelId: pricePerMtok} map onto MODELS, then re-render. */
function applyPrices(priceMap) {
  for (const m of MODELS) {
    if (priceMap[m.id] != null) m.price = priceMap[m.id];
  }
  updatePriceSourceLabel();
  // re-render meters + models with whatever encoding is showing (if booted)
  if (lastResults) {
    setMeters(currentEncoding, false);
    renderModels(currentEncoding);
  }
}

function updatePriceSourceLabel() {
  const el = document.getElementById("price-source");
  if (el) el.textContent = "prices: LiteLLM (" + priceSourceLabel + ")";
}

/** Load cached prices (instant), then fetch fresh ones in the background. */
function initPricing() {
  updatePriceSourceLabel(); // "snapshot" until we know better
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) || "null");
  } catch (e) {
    cached = null;
  }
  const fresh = cached && Date.now() - cached.ts < PRICE_MAX_AGE_MS;
  if (cached && cached.prices) {
    priceSourceLabel = "cached";
    applyPrices(cached.prices);
  }
  if (fresh) return; // cache is recent enough; skip the network entirely
  // Background refresh — fail silently, keep snapshot/cache on any error.
  fetch(LITELLM_URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .then((blob) => {
      const prices = extractPrices(blob);
      if (!Object.keys(prices).length) return;
      priceSourceLabel = "live";
      try {
        localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ ts: Date.now(), prices }));
      } catch (e) {
        /* storage full / disabled — non-fatal */
      }
      applyPrices(prices);
    })
    .catch(() => {
      /* offline or blocked — keep snapshot/cache silently */
    });
}
function fmtCost(usd) {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "$" + usd.toFixed(5);
  if (usd < 1) return "$" + usd.toFixed(4);
  return "$" + usd.toFixed(3);
}
/** Per-Mtok price label, trimming float noise (e.g. 2.5, 0.15, 5). */
function fmtPrice(usdPerMtok) {
  return String(Math.round(usdPerMtok * 100) / 100);
}

// ===========================================================================
// JTF v2 ENCODER — faithful JS port of token_diet/vendor/jtf.py (encode side).
// Ported: string safety, primitives, objects (key=val / key: block), empty
// containers, primitive arrays, flat + nested-uniform tabular arrays, mixed
// dash lists, and the value-dictionary (exact + URL/timestamp prefix aliases)
// with the same break-even analysis. Tokenizer-driven costs use the live
// cl100k/o200k encoder so the dictionary decision matches what JTF would do.
// ===========================================================================

const JTF_RESERVED = new Set(["null", "true", "false"]);
// Forbidden chars in a bare string: \n \r , = : | " \ # [ ] { } \t $ @
// (matches _SAFE_RE in jtf.py: ^[^\n\r,=:|"\\#\[\]{}\t$@]+$)
const JTF_UNSAFE_CHARS = /[\n\r,=:|"\\#\[\]{}\t$@]/;

function jtfSafe(s) {
  if (typeof s !== "string" || s.length === 0) return false;
  if (JTF_RESERVED.has(s)) return false;
  if (s !== s.trim()) return false;
  if ('"[{-#=$@'.includes(s[0])) return false;
  if (s.includes("= ") || s.endsWith("=")) return false;
  return !JTF_UNSAFE_CHARS.test(s);
}

// Would a bare string be mis-read as a number? (numeric-string quoting fix)
function jtfLooksNumeric(s) {
  if (typeof s !== "string" || s.trim() === "") return false;
  const t = s.trim();
  if (t !== s) return false;
  // mimic Python int()/float() acceptance closely enough for canonical forms
  if (/[.eE]/.test(t)) return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t);
  return /^[+-]?\d+$/.test(t);
}

// JSON.dumps-equivalent for a string (ensure_ascii=False): JS JSON.stringify
// already produces compatible escapes for the common cases.
const jsonStr = (s) => JSON.stringify(s);

// Encode a primitive value exactly like jtf.py _ep().
function jtfEncPrim(v) {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return jtfNumber(v);
  // string
  if (jtfLooksNumeric(v)) return jsonStr(v);
  return jtfSafe(v) ? v : jsonStr(v);
}
// Canonical JSON number form. NOTE: one unavoidable JS↔Python difference —
// JSON.parse collapses whole-number floats (e.g. `5.0`) to the integer `5`,
// because JS has a single Number type and loses the original ".0". Python's
// json keeps `5.0`. This is cosmetic (same value, still lossless) and only
// shows up for integral floats; everything else is byte-identical to jtf.py.
function jtfNumber(n) {
  return String(n);
}
// Encode a key/value string: bare if safe else quoted (jtf.py _es / _val_repr).
const jtfEs = (s) => (jtfSafe(s) ? s : jsonStr(s));
const jtfValRepr = jtfEs;

const isPrim = (v) =>
  v === null || typeof v === "boolean" || typeof v === "number" || typeof v === "string";
const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

// ---- nested-uniform detection (jtf.py _is_nested_uniform) ----------------
function dottedPathsOrdered(obj, prefix = "") {
  const result = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const path = prefix ? `${prefix}.${k}` : k;
    if (isPrim(v)) result.push(path);
    else if (isPlainObject(v)) {
      const child = dottedPathsOrdered(v, path);
      if (child === null) return null;
      result.push(...child);
    } else return null; // a list leaf -> can't flatten
  }
  return result;
}
function isNestedUniform(arr) {
  if (!arr.length || !isPlainObject(arr[0]) || Object.keys(arr[0]).length === 0)
    return null;
  const paths0 = dottedPathsOrdered(arr[0]);
  if (paths0 === null || paths0.length === 0) return null;
  const set0 = new Set(paths0);
  for (let i = 1; i < arr.length; i++) {
    const item = arr[i];
    if (!isPlainObject(item)) return null;
    const ps = dottedPathsOrdered(item);
    if (ps === null) return null;
    const s = new Set(ps);
    if (s.size !== set0.size) return null;
    for (const p of s) if (!set0.has(p)) return null;
  }
  const hasDots = paths0.some((p) => p.includes("."));
  return { paths: paths0, hasDots };
}
function getPath(obj, path) {
  let cur = obj;
  for (const p of path.split(".")) cur = cur[p];
  return cur;
}

// ---- value dictionary (jtf.py _build_dictionary) -------------------------
const PREFIX_MIN_LEN = 10;
function collectValues(data, vctr, pctr) {
  if (typeof data === "string") {
    vctr.set(data, (vctr.get(data) || 0) + 1);
    notePrefix(data, pctr);
  } else if (Array.isArray(data)) {
    for (const x of data) collectValues(x, vctr, pctr);
  } else if (isPlainObject(data)) {
    for (const v of Object.values(data)) collectValues(v, vctr, pctr);
  }
}
function notePrefix(s, pctr) {
  if (s.startsWith("http://") || s.startsWith("https://")) {
    const idx = s.lastIndexOf("/");
    if (idx > 8 && idx < s.length - 1) {
      const prefix = s.slice(0, idx + 1);
      if (prefix.length >= PREFIX_MIN_LEN)
        pctr.set(prefix, (pctr.get(prefix) || 0) + 1);
    }
  }
  if (s.length > 10 && s[10] === "T" && /^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const p = s.slice(0, 11);
    pctr.set(p, (pctr.get(p) || 0) + 1);
  }
}
// cost function == live tokenizer (matches jtf.py using tiktoken)
const tok = (s) => countTokens(s);

function buildDictionary(data, minNetSavings = 2) {
  const vctr = new Map();
  const pctr = new Map();
  collectValues(data, vctr, pctr);

  const entries = [];               // {token, value, isPrefix}
  const valueMap = new Map();       // value -> token
  const prefixCovered = new Set();
  let idx = 0;
  const entrySavings = [];
  const entryCosts = [];

  // Phase 1: exact-value entries (sorted by -count*tok(repr))
  const vItems = [...vctr.entries()].sort(
    (a, b) => b[1] * tok(jtfValRepr(b[0])) - a[1] * tok(jtfValRepr(a[0]))
  );
  for (const [val, count] of vItems) {
    if (count < 2) continue;
    const valRepr = jtfValRepr(val);
    const valCost = tok(valRepr);
    const tokName = `$${idx}`;
    const tokCost = tok(tokName);
    if (valCost <= tokCost) continue;
    const dictLine = `  ${tokName}=${valRepr}`;
    const entryCost = tok(dictLine);
    const gross = (valCost - tokCost) * count;
    if (gross > entryCost + minNetSavings) {
      entries.push({ token: tokName, value: val, isPrefix: false });
      valueMap.set(val, tokName);
      entrySavings.push(gross);
      entryCosts.push(entryCost);
      idx++;
    }
  }
  // Phase 2: prefix entries (most_common)
  const pItems = [...pctr.entries()].sort((a, b) => b[1] - a[1]);
  for (const [prefix, pCount] of pItems) {
    if (pCount < 2) continue;
    const matching = [...vctr.keys()].filter(
      (v) => v.startsWith(prefix) && !valueMap.has(v)
    );
    if (matching.length < 2) continue;
    const prefixRepr = jtfValRepr(prefix);
    const tokName = `$${idx}`;
    const tokCost = tok(tokName);
    const dictLine = `  ${tokName}=${prefixRepr}`;
    const entryCost = tok(dictLine);
    let gross = 0;
    for (const v of matching) {
      const count = vctr.get(v);
      const fullCost = tok(jtfValRepr(v));
      const suffix = v.slice(prefix.length);
      const newCost = tok("{" + tokName + "}" + suffix);
      gross += (fullCost - newCost) * count;
    }
    if (gross > entryCost + minNetSavings) {
      entries.push({ token: tokName, value: prefix, isPrefix: true });
      for (const v of matching) prefixCovered.add(v);
      entrySavings.push(gross);
      entryCosts.push(entryCost);
      idx++;
    }
  }
  // Global break-even vs fixed header/footer overhead.
  if (entries.length) {
    const fixed = tok("#vdf:v2\n#dict:\n") + tok("#end\n");
    const net =
      entrySavings.reduce((a, b) => a + b, 0) -
      entryCosts.reduce((a, b) => a + b, 0) -
      fixed;
    if (net <= 0) return { entries: [], valueMap: new Map(), prefixCovered: new Set() };
  }
  return { entries, valueMap, prefixCovered };
}

// ---- encoder core (jtf.py _Encoder) --------------------------------------
function makeEncoder(valueMap, prefixCovered, prefixTokens) {
  const sortedPrefixes = [...prefixTokens].sort((a, b) => b[0].length - a[0].length);
  function encStr(s) {
    if (valueMap.has(s)) return valueMap.get(s);
    if (prefixCovered.has(s)) {
      for (const [prefix, t] of sortedPrefixes) {
        if (s.startsWith(prefix)) return "{" + t + "}" + s.slice(prefix.length);
      }
    }
    return jtfEncPrim(s);
  }
  const encVal = (v) => (typeof v === "string" ? encStr(v) : jtfEncPrim(v));

  function encObj(obj, depth) {
    const keys = Object.keys(obj);
    if (keys.length === 0) return ["{}"];
    const pad = "\t".repeat(depth);
    const lines = [];
    for (const k of keys) {
      const v = obj[k];
      const ek = jtfEs(k);
      if (isPrim(v)) {
        lines.push(pad + `${ek}=${encVal(v)}`);
      } else if (Array.isArray(v)) {
        const arr = encArray(v, depth);
        if (arr.length === 1) lines.push(pad + `${ek}=${arr[0]}`);
        else {
          lines.push(pad + `${ek}:${arr[0]}`);
          for (let i = 1; i < arr.length; i++) lines.push(arr[i]);
        }
      } else if (isPlainObject(v)) {
        if (Object.keys(v).length === 0) lines.push(pad + ek + "={}");
        else {
          lines.push(pad + `${ek}:`);
          lines.push(...encObj(v, depth + 1));
        }
      }
    }
    return lines;
  }

  function encArray(arr, depth) {
    const pad = "\t".repeat(depth);
    const n = arr.length;
    if (n === 0) return ["[0]"];
    if (arr.every(isPrim)) {
      return [`[${n}] ` + arr.map(encVal).join(",")];
    }
    const uni = isNestedUniform(arr);
    if (uni !== null) {
      const { paths } = uni;
      const rowPad = pad + "\t";
      const safeKeys = paths.every((p) => jtfSafe(p) && !p.includes(" "));
      const hdr = safeKeys ? paths.join(" ") : "csv:" + paths.map(jtfEs).join(",");
      const lines = [`#${n} ${hdr}`];
      for (const item of arr) {
        lines.push(rowPad + paths.map((p) => encVal(getPath(item, p))).join("\t"));
      }
      return lines;
    }
    // mixed / dash list
    const contPad = pad + "\t\t";
    const lines = [`[${n}]`];
    for (const item of arr) {
      const il = encItem(item);
      if (il.length) {
        lines.push(pad + "\t- " + il[0]);
        for (let i = 1; i < il.length; i++) lines.push(contPad + il[i]);
      } else lines.push(pad + "\t-");
    }
    return lines;
  }

  function encItem(val) {
    if (isPrim(val)) return [encVal(val)];
    if (Array.isArray(val)) return encArray(val, 0);
    if (isPlainObject(val)) return encObj(val, 0);
    return [encVal(val)];
  }

  return { encObj, encArray, encVal };
}

function jtfEncode(data) {
  const { entries, valueMap, prefixCovered } = buildDictionary(data);
  const prefixTokens = entries.filter((e) => e.isPrefix).map((e) => [e.value, e.token]);
  const enc = makeEncoder(valueMap, prefixCovered, prefixTokens);

  let bodyLines;
  if (isPlainObject(data)) bodyLines = enc.encObj(data, 0);
  else if (Array.isArray(data)) bodyLines = enc.encArray(data, 0);
  else bodyLines = [enc.encVal(data)];

  if (!entries.length) return bodyLines.join("\n");

  const header = ["#vdf:v2", "#dict:"];
  for (const e of entries) {
    const sep = e.isPrefix ? "~=" : "=";
    header.push(`  ${e.token}${sep}${jtfValRepr(e.value)}`);
  }
  header.push("#end");
  return header.join("\n") + "\n" + bodyLines.join("\n");
}

// ===========================================================================
// OTHER ENCODERS (faithful to token_diet/encoders.py)
// ===========================================================================
const jsonPretty = (d) => JSON.stringify(d, null, 2);
const jsonMin = (d) => JSON.stringify(d);

function collectKeys(data, acc) {
  if (isPlainObject(data)) {
    for (const k of Object.keys(data)) {
      if (!acc.includes(k)) acc.push(k);
      collectKeys(data[k], acc);
    }
  } else if (Array.isArray(data)) {
    for (const v of data) collectKeys(v, acc);
  }
}
function shortNames() {
  const singles = "abcdefghijklmnopqrstuvwxyz".split("");
  const out = [...singles];
  for (const f of singles) for (const s of "0123456789") out.push(f + s);
  return out;
}
function shortenKeys(data, mapping) {
  if (isPlainObject(data)) {
    const o = {};
    for (const k of Object.keys(data)) o[mapping[k]] = shortenKeys(data[k], mapping);
    return o;
  }
  if (Array.isArray(data)) return data.map((v) => shortenKeys(v, mapping));
  return data;
}
function jsonShortKeys(data) {
  const keys = [];
  collectKeys(data, keys);
  if (!keys.length) return jsonMin(data);
  const names = shortNames();
  const mapping = {};
  const inverse = {};
  keys.forEach((orig, i) => {
    mapping[orig] = names[i];
    inverse[names[i]] = orig;
  });
  const body = JSON.stringify(shortenKeys(data, mapping));
  const mapLine = "// keymap " + JSON.stringify(inverse);
  return mapLine + "\n" + body; // map travels with payload, counted in tokens
}

const ENCODERS = {
  "json-pretty": jsonPretty,
  "json-min": jsonMin,
  "json-shortkeys": jsonShortKeys,
  jtf: jtfEncode,
};

// ===========================================================================
// SAMPLES (prefill)
// ===========================================================================
const SAMPLES = {
  users: JSON.stringify(
    [
      { id: 1, name: "Noah Carter", email: "noah.carter@example.com", age: 36, city: "Austin", plan: "pro", active: false, signups: 52 },
      { id: 2, name: "Nora Patel", email: "nora.patel@example.com", age: 56, city: "Mumbai", plan: "free", active: false, signups: 111 },
      { id: 3, name: "Lucas Walsh", email: "lucas.walsh@example.com", age: 57, city: "Berlin", plan: "pro", active: true, signups: 279 },
      { id: 4, name: "Zoe Silva", email: "zoe.silva@example.com", age: 47, city: "Seoul", plan: "team", active: true, signups: 3 },
      { id: 5, name: "Ethan Lopez", email: "ethan.lopez@example.com", age: 40, city: "Lisbon", plan: "pro", active: true, signups: 172 },
      { id: 6, name: "Noah Patel", email: "noah.patel@example.com", age: 43, city: "Tokyo", plan: "team", active: true, signups: 309 },
      { id: 7, name: "Emma Nguyen", email: "emma.nguyen@example.com", age: 48, city: "Lima", plan: "free", active: true, signups: 193 },
      { id: 8, name: "Maya Yamada", email: "maya.yamada@example.com", age: 37, city: "Seoul", plan: "team", active: true, signups: 35 },
      { id: 9, name: "Liam Silva", email: "liam.silva@example.com", age: 37, city: "Tokyo", plan: "pro", active: true, signups: 194 },
      { id: 10, name: "Emma Petrov", email: "emma.petrov@example.com", age: 59, city: "Toronto", plan: "pro", active: true, signups: 107 },
      { id: 11, name: "Owen Kim", email: "owen.kim@example.com", age: 35, city: "Lagos", plan: "pro", active: true, signups: 275 },
      { id: 12, name: "Leo Rossi", email: "leo.rossi@example.com", age: 60, city: "Oslo", plan: "enterprise", active: true, signups: 329 },
    ],
    null,
    2
  ),
  api: JSON.stringify(
    {
      meta: { requestId: "req_8f2a91c4", tookMs: 42, apiVersion: "2026-04-01" },
      pagination: { page: 1, perPage: 12, total: 87, totalPages: 8, next: "https://api.example.com/repos/acme/widget/issues?page=2" },
      data: [
        { id: 100001, number: 1, title: "Add dark mode", state: "open", author: { login: "leo", id: 5325 }, labels: ["question", "docs", "bug"], comments: 2, createdAt: "2026-06-23T05:15:00Z", url: "https://api.example.com/repos/acme/widget/issues/1" },
        { id: 100002, number: 2, title: "Fix memory leak", state: "closed", author: { login: "mia", id: 9912 }, labels: ["bug"], comments: 7, createdAt: "2026-06-22T11:02:00Z", url: "https://api.example.com/repos/acme/widget/issues/2" },
        { id: 100003, number: 3, title: "Improve docs", state: "open", author: { login: "leo", id: 5325 }, labels: ["docs"], comments: 0, createdAt: "2026-06-21T08:44:00Z", url: "https://api.example.com/repos/acme/widget/issues/3" },
      ],
    },
    null,
    2
  ),
  config: JSON.stringify(
    {
      service: "checkout",
      version: "3.4.0",
      replicas: 4,
      flags: { canary: true, rolloutPct: 25, regions: ["us-east", "eu-west", "ap-south"] },
      limits: { rps: 2000, burst: 5000, timeoutMs: 1500 },
      db: { host: "db.internal", port: 5432, pool: { min: 2, max: 20 }, ssl: true },
      logging: { level: "info", sinks: ["stdout", "datadog"] },
    },
    null,
    2
  ),
  events: JSON.stringify(
    [
      { ts: "2026-06-13T09:00:01Z", level: "info", svc: "auth", msg: "login ok", user: "u_1042" },
      { ts: "2026-06-13T09:00:04Z", level: "info", svc: "auth", msg: "login ok", user: "u_2210" },
      { ts: "2026-06-13T09:00:09Z", level: "warn", svc: "api", msg: "rate limited", user: "u_1042" },
      { ts: "2026-06-13T09:00:12Z", level: "error", svc: "pay", msg: "card declined", user: "u_5531" },
      { ts: "2026-06-13T09:00:15Z", level: "info", svc: "auth", msg: "logout", user: "u_2210" },
      { ts: "2026-06-13T09:00:21Z", level: "info", svc: "api", msg: "request ok", user: "u_8842" },
      { ts: "2026-06-13T09:00:26Z", level: "warn", svc: "pay", msg: "retry", user: "u_5531" },
      { ts: "2026-06-13T09:00:31Z", level: "info", svc: "pay", msg: "charged", user: "u_5531" },
    ],
    null,
    2
  ),
};

// ===========================================================================
// UI WIRING
// ===========================================================================
const $ = (sel) => document.querySelector(sel);
const els = {
  input: $("#json-input"),
  jsonStatus: $("#json-status"),
  tokStatus: $("#tok-status"),
  tokenCount: $("#token-count"),
  costValue: $("#cost-value"),
  meterEnc: $("#meter-enc"),
  chips: $("#chips"),
  chipsSub: $("#chips-sub"),
  dietBtn: $("#diet-btn"),
  dietReveal: $("#diet-reveal"),
  revealPct: $("#reveal-pct"),
  revealDetail: $("#reveal-detail"),
  bars: $("#bars"),
  models: $("#models"),
  modelsNote: $("#models-note"),
  sampleSelect: $("#sample-select"),
};

const prefersReducedMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let currentEncoding = "json-pretty"; // which encoding the meter currently shows
let lastValidData = null;            // last successfully parsed JSON
let lastResults = null;              // { encName: { text, tokens } }
const MAX_CHIPS = 1200;              // cap chip rendering for big inputs

function parseInput() {
  const raw = els.input.value;
  try {
    const data = JSON.parse(raw);
    lastValidData = data;
    els.jsonStatus.textContent = "valid";
    els.jsonStatus.className = "json-status ok";
    return data;
  } catch (e) {
    els.jsonStatus.textContent = "invalid JSON";
    els.jsonStatus.className = "json-status bad";
    return null;
  }
}

/** Run every encoder + count tokens. Returns map encName -> {text, tokens}. */
function computeResults(data) {
  const res = {};
  for (const [name, fn] of Object.entries(ENCODERS)) {
    let text = null;
    try {
      text = fn(data);
    } catch (e) {
      res[name] = { text: null, tokens: null, error: String(e) };
      continue;
    }
    res[name] = { text, tokens: countTokens(text) };
  }
  return res;
}

// ---- animated number tween -----------------------------------------------
function animateNumber(el, from, to, fmt, ms = 700) {
  if (prefersReducedMotion || from === to) {
    el.textContent = fmt(to);
    el.dataset.target = String(to);
    return;
  }
  el.dataset.target = String(to);
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const val = from + (to - from) * eased;
    el.textContent = fmt(val);
    if (t < 1 && el.dataset.target === String(to)) requestAnimationFrame(step);
    else el.textContent = fmt(to);
  }
  requestAnimationFrame(step);
}

// ---- meters ---------------------------------------------------------------
function setMeters(encName, animate = false) {
  if (!lastResults) return;
  const r = lastResults[encName];
  const tokens = r && r.tokens != null ? r.tokens : 0;
  const price = MODELS.find((m) => m.id === PRIMARY_MODEL).price;
  const cost = costOf(tokens, price);

  els.meterEnc.textContent = encName;
  const fromTok = parseFloat(els.tokenCount.dataset.target || "0");
  const fromCost = parseFloat(els.costValue.dataset.costtarget || "0");
  els.costValue.dataset.costtarget = String(cost);

  if (animate) {
    animateNumber(els.tokenCount, fromTok, tokens, (v) => Math.round(v).toLocaleString());
    animateNumber(els.costValue, fromCost, cost, (v) => fmtCost(v));
    els.tokenCount.classList.remove("flash");
    void els.tokenCount.offsetWidth;
    els.tokenCount.classList.add("flash");
  } else {
    els.tokenCount.dataset.target = String(tokens);
    els.tokenCount.textContent = Math.round(tokens).toLocaleString();
    els.costValue.textContent = fmtCost(cost);
  }
}

// ---- token chips ----------------------------------------------------------
function renderChips(encName) {
  if (!lastResults) return;
  const r = lastResults[encName];
  els.chips.innerHTML = "";
  if (!r || r.text == null) {
    els.chipsSub.textContent = "—";
    return;
  }
  const toks = tokenStrings(r.text);
  els.chipsSub.textContent = `${toks.length.toLocaleString()} tokens · ${encName}`;
  const frag = document.createDocumentFragment();
  const limit = Math.min(toks.length, MAX_CHIPS);
  let colorIdx = 0;
  for (let i = 0; i < limit; i++) {
    const t = toks[i];
    // Render newlines as line breaks so multi-line structure is readable.
    if (t === "\n") {
      const br = document.createElement("span");
      br.className = "chip-nl";
      frag.appendChild(br);
      continue;
    }
    const span = document.createElement("span");
    span.className = "chip c" + (colorIdx % 6);
    // show literal text; replace tab/newline with visible glyphs
    span.textContent = t.replace(/\t/g, "⇥").replace(/\n/g, "↵");
    span.title = JSON.stringify(t);
    frag.appendChild(span);
    colorIdx++;
  }
  els.chips.appendChild(frag);
  if (toks.length > limit) {
    const more = document.createElement("span");
    more.className = "chip-more";
    more.textContent = `+${(toks.length - limit).toLocaleString()} more tokens…`;
    els.chips.appendChild(more);
  }
}

// ---- bar chart ------------------------------------------------------------
function renderBars() {
  if (!lastResults) return;
  els.bars.innerHTML = "";
  const order = ["json-pretty", "json-min", "json-shortkeys", "jtf"];
  const baseline = lastResults["json-pretty"]?.tokens || 0;
  const vals = order
    .map((n) => lastResults[n]?.tokens)
    .filter((v) => v != null && v > 0);
  const max = Math.max(...vals, 1);
  // best = lowest token count among the encodings
  let bestName = order[0];
  let bestTok = Infinity;
  for (const n of order) {
    const t = lastResults[n]?.tokens;
    if (t != null && t < bestTok) {
      bestTok = t;
      bestName = n;
    }
  }
  for (const name of order) {
    const r = lastResults[name];
    const row = document.createElement("div");
    row.className = "bar-row" + (name === bestName ? " is-best" : "");
    const tokens = r?.tokens;
    const pct =
      baseline && tokens != null ? Math.round((1 - tokens / baseline) * 100) : null;
    let pctLabel = "";
    if (name === "json-pretty") pctLabel = '<span class="pct">baseline</span>';
    else if (pct != null)
      pctLabel = `<span class="pct">${pct > 0 ? "−" : "+"}${Math.abs(pct)}%</span>`;
    const width = tokens != null ? (tokens / max) * 100 : 0;
    row.innerHTML = `
      <span class="bar-name">${name}</span>
      <span class="bar-track"><span class="bar-fill" style="width:0%"></span></span>
      <span class="bar-val">${
        tokens != null ? tokens.toLocaleString() : "—"
      } ${pctLabel}</span>`;
    els.bars.appendChild(row);
    // animate width on next frame
    const fill = row.querySelector(".bar-fill");
    requestAnimationFrame(() => {
      fill.style.width = width + "%";
    });
  }
}

// ---- models grid ----------------------------------------------------------
function renderModels(encName) {
  if (!lastResults) return;
  const tokens = lastResults[encName]?.tokens || 0;
  els.modelsNote.textContent = `${encName} · ${tokens.toLocaleString()} input tokens`;
  els.models.innerHTML = "";
  for (const m of MODELS) {
    const div = document.createElement("div");
    div.className = "model " + m.kind;
    div.innerHTML = `
      <div class="model-name">${m.name}</div>
      <div class="model-price">$${fmtPrice(m.price)} / 1M in</div>
      <div class="model-cost">${fmtCost(costOf(tokens, m.price))}</div>`;
    els.models.appendChild(div);
  }
}

// ---- full refresh ----------------------------------------------------------
function refresh({ resetEncoding = true } = {}) {
  const data = parseInput();
  if (data === null) return; // keep last good render, just flag invalid
  lastResults = computeResults(data);
  if (resetEncoding) {
    currentEncoding = "json-pretty";
    resetDietButton();
  }
  setMeters(currentEncoding, false);
  renderChips(currentEncoding);
  renderBars();
  renderModels(currentEncoding);
}

function resetDietButton() {
  els.dietBtn.disabled = false;
  els.dietBtn.classList.remove("dieted");
  els.dietBtn.innerHTML =
    '<svg class="diet-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg> Put it on a diet';
  els.dietReveal.hidden = true;
}

// ---- the diet (the moneymaker) --------------------------------------------
function putOnDiet() {
  if (!lastResults) return;
  const before = lastResults["json-pretty"];
  // best lossless option = lowest token count among non-pretty encodings
  const candidates = ["json-min", "json-shortkeys", "jtf"];
  let best = "jtf";
  let bestTok = Infinity;
  for (const n of candidates) {
    const t = lastResults[n]?.tokens;
    if (t != null && t < bestTok) {
      bestTok = t;
      best = n;
    }
  }
  const after = lastResults[best];
  if (!before || !after || before.tokens == null || after.tokens == null) return;

  currentEncoding = best;
  setMeters(best, true);
  renderChips(best);
  renderModels(best);
  // re-mark best bar (already best, but keep consistent)
  renderBars();

  const pct = Math.round((1 - after.tokens / before.tokens) * 100);
  const beforeCost = costOf(before.tokens, MODELS.find((m) => m.id === PRIMARY_MODEL).price);
  const afterCost = costOf(after.tokens, MODELS.find((m) => m.id === PRIMARY_MODEL).price);
  els.revealPct.textContent = (pct >= 0 ? "−" : "+") + Math.abs(pct) + "%";
  els.revealDetail.textContent = `${before.tokens.toLocaleString()} → ${after.tokens.toLocaleString()} tokens · best: ${best} · saves ${fmtCost(
    beforeCost - afterCost
  )}/call (Sonnet)`;
  els.dietReveal.hidden = false;
  if (!prefersReducedMotion) {
    els.revealPct.style.animation = "none";
    void els.revealPct.offsetWidth;
    els.revealPct.style.animation = "";
  }

  els.dietBtn.classList.add("dieted");
  els.dietBtn.innerHTML = `<svg class="diet-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg> On a diet — showing ${best}`;
}

// ---- events ----------------------------------------------------------------
let debounceTimer = null;
els.input.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => refresh({ resetEncoding: true }), 220);
});

els.dietBtn.addEventListener("click", putOnDiet);

els.sampleSelect.addEventListener("change", (e) => {
  const key = e.target.value;
  if (SAMPLES[key]) {
    els.input.value = SAMPLES[key];
    refresh({ resetEncoding: true });
  }
});

document.querySelectorAll(".toggle-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const name = btn.dataset.tokenizer;
    if (name === activeTokenizer && encoders[name]) return;
    document.querySelectorAll(".toggle-btn").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-checked", String(on));
    });
    activeTokenizer = name;
    setStatus("loading", `loading ${name}…`);
    try {
      await ensureTokenizer(name);
      setStatus("ready", `${name} ready · counts are real`);
      refresh({ resetEncoding: false });
    } catch (e) {
      setStatus("error", `${name} unavailable — try cl100k_base`);
    }
  });
});

function setStatus(kind, text) {
  els.tokStatus.className = "tok-status " + kind;
  els.tokStatus.textContent = text;
}

async function ensureTokenizer(name) {
  if (encoders[name]) return;
  const mod = await import(TOKENIZER_SOURCES[name]);
  const encode = mod.encode || (mod.default && mod.default.encode);
  const decode = mod.decode || (mod.default && mod.default.decode);
  if (typeof encode !== "function") throw new Error("encode missing");
  encoders[name] = encode;
  if (typeof decode === "function") decoders[name] = decode;
}

// ---- boot ------------------------------------------------------------------
async function boot() {
  els.input.value = SAMPLES.users;
  setStatus("loading", "loading tokenizer…");
  try {
    await ensureTokenizer("cl100k");
    setStatus("ready", "cl100k_base ready · counts are real");
  } catch (e) {
    setStatus("error", "tokenizer failed to load (offline?)");
    els.dietBtn.disabled = true;
    return;
  }
  refresh({ resetEncoding: true });
  initPricing(); // instant snapshot/cache, then live LiteLLM refresh in background
}

boot();
