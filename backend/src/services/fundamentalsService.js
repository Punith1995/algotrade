/**
 * Fundamentals via Yahoo Finance (free). Yahoo occasionally gates these
 * endpoints — everything degrades gracefully to { available: false } and
 * the long-term score falls back to technicals-only.
 */
const axios = require("axios");
const redis = require("../redis/redisClient");
const logger = require("../utils/logger");

const H = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };

async function fetchSummary(symbol) {
  const mods = "summaryDetail,defaultKeyStatistics,financialData";
  for (const host of ["query2", "query1"]) {
    try {
      const a = await yahooAuth();
      const crumbQ = a.crumb ? `&crumb=${encodeURIComponent(a.crumb)}` : "";
      const url = `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}.NS?modules=${mods}${crumbQ}`;
      let { data } = await axios.get(url, { timeout: 8000, headers: a.cookie ? { ...H, Cookie: a.cookie } : H })
        .catch(async (err) => {
          if (err.response?.status === 401 || err.response?.status === 403) {
            const a2 = await yahooAuth(true); // stale crumb — refresh once and retry
            const url2 = `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}.NS?modules=${mods}&crumb=${encodeURIComponent(a2.crumb || "")}`;
            return axios.get(url2, { timeout: 8000, headers: a2.cookie ? { ...H, Cookie: a2.cookie } : H });
          }
          throw err;
        });
      const r = data?.quoteSummary?.result?.[0];
      if (r) return r;
    } catch { /* try next host */ }
  }
  return null;
}

const num = (v) => (v && typeof v === "object" ? v.raw : v) ?? null;

/**
 * Yahoo now gates quoteSummary behind a cookie + "crumb" token. This is
 * their standard public flow (the same one a browser performs), not
 * scraping a ToS-protected site: fetch a cookie, exchange it for a crumb,
 * attach both. Cached ~6 h; refreshed automatically on 401.
 */
let auth = { cookie: null, crumb: null, at: 0 };
async function yahooAuth(force = false) {
  if (!force && auth.crumb && Date.now() - auth.at < 6 * 3600 * 1000) return auth;
  try {
    const r1 = await axios.get("https://fc.yahoo.com", { timeout: 8000, headers: H, validateStatus: () => true });
    const cookie = (r1.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
    if (!cookie) throw new Error("no cookie");
    const r2 = await axios.get("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      timeout: 8000, headers: { ...H, Cookie: cookie },
    });
    auth = { cookie, crumb: String(r2.data).trim(), at: Date.now() };
  } catch (e) {
    auth = { cookie: null, crumb: null, at: Date.now() }; // fall through to unauthenticated attempt
  }
  return auth;
}

async function getFundamentals(symbol) {
  symbol = symbol.toUpperCase();
  const key = `funda:${symbol}:${new Date().toISOString().slice(0, 10)}`;
  const cached = await redis.get(key);
  if (cached) return cached;

  const r = await fetchSummary(symbol);
  let out;
  if (!r) {
    out = { available: false, note: "Fundamental data source unavailable right now — score uses long-term technicals only." };
  } else {
    const sd = r.summaryDetail || {}, ks = r.defaultKeyStatistics || {}, fd = r.financialData || {};
    out = {
      available: true,
      pe: num(sd.trailingPE) ?? num(ks.trailingPE),
      forwardPE: num(sd.forwardPE) ?? num(ks.forwardPE),
      pb: num(ks.priceToBook),
      eps: num(ks.trailingEps),
      roe: num(fd.returnOnEquity) != null ? +(num(fd.returnOnEquity) * 100).toFixed(1) : null,
      debtToEquity: num(fd.debtToEquity) != null ? +(num(fd.debtToEquity) / 100).toFixed(2) : null,
      profitMargin: num(fd.profitMargins) != null ? +(num(fd.profitMargins) * 100).toFixed(1) : null,
      revenueGrowth: num(fd.revenueGrowth) != null ? +(num(fd.revenueGrowth) * 100).toFixed(1) : null,
      dividendYield: num(sd.dividendYield) != null ? +(num(sd.dividendYield) * 100).toFixed(2) : null,
      marketCapCr: num(sd.marketCap) != null ? Math.round(num(sd.marketCap) / 1e7) : null,
      week52High: num(sd.fiftyTwoWeekHigh),
      week52Low: num(sd.fiftyTwoWeekLow),
    };
  }
  await redis.set(key, out, 12 * 3600);
  return out;
}

module.exports = { getFundamentals };
