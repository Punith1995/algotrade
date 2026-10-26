/**
 * Symbol mapping between the app and Angel One.
 *
 * Inside the app a stock is "NSE:<SYMBOL>-EQ" (e.g. NSE:SBIN-EQ), and indices are
 * NSE:NIFTY50-INDEX and NSE:NIFTYBANK-INDEX. Angel One identifies every
 * instrument by a numeric "symboltoken" (SBIN = 3045). This module maps between them.
 *
 * The full list comes from Angel's public scrip master, downloaded once at startup.
 */
const axios = require("axios");

const SCRIP_MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";
const NIFTY50_TOKEN = "NSE:NIFTY50-INDEX";
const BANKNIFTY_TOKEN = "NSE:NIFTYBANK-INDEX";

// Index tokens on Angel One's NSE exchange. Used even before the master loads.
const byInternal = new Map([
  [NIFTY50_TOKEN, { token: "99926000", tradingsymbol: "Nifty 50" }],
  [BANKNIFTY_TOKEN, { token: "99926009", tradingsymbol: "Nifty Bank" }],
]);
const byAngel = new Map([
  ["99926000", NIFTY50_TOKEN],
  ["99926009", BANKNIFTY_TOKEN],
]);
const bySymbol = new Map();   // "SBIN" -> "NSE:SBIN-EQ"
let equities = [];            // [{ symbol, name, token }]
let loaded = false;

async function loadInstruments() {
  const { data } = await axios.get(SCRIP_MASTER_URL, { timeout: 120000 });
  bySymbol.clear();
  equities = [];
  for (const row of Array.isArray(data) ? data : []) {
    if (row.exch_seg !== "NSE") continue;
    const sym = String(row.symbol || "");
    if (!/-EQ$/.test(sym)) continue;                 // equity series only
    const name = sym.replace(/-EQ$/, "");
    const internal = `NSE:${name}-EQ`;
    const token = String(row.token);
    bySymbol.set(name, internal);
    byInternal.set(internal, { token, tradingsymbol: sym });
    byAngel.set(token, internal);
    equities.push({ symbol: name, name: row.name || name, token: internal });
  }
  loaded = true;
  console.log(`[instruments] Loaded ${equities.length} NSE equities`);
}

/** "SBIN" → "NSE:SBIN-EQ". Before the list loads, the standard form is returned. */
function getToken(symbol) {
  const s = String(symbol || "").toUpperCase();
  if (!s) return null;
  if (s === "NIFTY 50") return NIFTY50_TOKEN;
  if (s === "BANKNIFTY" || s === "NIFTY BANK") return BANKNIFTY_TOKEN;
  if (bySymbol.has(s)) return bySymbol.get(s);
  return loaded ? null : `NSE:${s}-EQ`;
}

/** "NSE:SBIN-EQ" → "SBIN". Index tokens map to their display names. */
function getSymbol(token) {
  if (token === NIFTY50_TOKEN) return "NIFTY 50";
  if (token === BANKNIFTY_TOKEN) return "BANKNIFTY";
  const m = /^NSE:(.+?)(-EQ|-INDEX)?$/.exec(token || "");
  return m ? m[1] : null;
}

/** App token → Angel One numeric symboltoken, e.g. "NSE:SBIN-EQ" → "3045". */
function angelTokenOf(internal) {
  return byInternal.get(internal)?.token || null;
}

/** Angel One symboltoken → app token, e.g. "3045" → "NSE:SBIN-EQ". */
function internalOf(angelToken) {
  return byAngel.get(String(angelToken)) || null;
}

function getTokens(symbols) { return symbols.map(getToken).filter(Boolean); }
function getAllEquities() { return equities; }
function getAllSymbols() { return equities.map((e) => e.symbol); }

module.exports = {
  loadInstruments, getToken, getSymbol, getTokens, getAllEquities, getAllSymbols,
  angelTokenOf, internalOf, NIFTY50_TOKEN, BANKNIFTY_TOKEN,
};
