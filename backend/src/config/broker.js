/**
 * Angel One SmartAPI — login and the authenticated session.
 *
 * No browser step. The backend logs in itself using:
 *   ANGEL_API_KEY       the SmartAPI app key
 *   ANGEL_CLIENT_CODE   your Angel One client ID (e.g. A123456)
 *   ANGEL_PIN           your 4-digit login PIN (MPIN)
 *   ANGEL_TOTP_SECRET   the base32 key from your TOTP setup
 *
 * The session is saved to token.json and reused for the rest of the IST day.
 * A new login happens automatically on the next day (see ensureLogin).
 */
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { totp } = require("../utils/totp");

const ROOT = "https://apiconnect.angelone.in";
const TOKEN_FILE = path.join(__dirname, "../../token.json");

const ROUTES = {
  login: "/rest/auth/angelbroking/user/v1/loginByPassword",
  quote: "/rest/secure/angelbroking/market/v1/quote",
  candles: "/rest/secure/angelbroking/historical/v1/getCandleData",
  holdings: "/rest/secure/angelbroking/portfolio/v1/getHolding",
  positions: "/rest/secure/angelbroking/order/v1/getPosition",
  orderBook: "/rest/secure/angelbroking/order/v1/getOrderBook",
};

// Angel error codes that mean the session is no longer valid.
const SESSION_ERRORS = new Set(["AG8001", "AG8002"]);

let session = null; // { jwtToken, feedToken, refreshToken, clientCode, saved_at }

const env = () => ({
  apiKey: process.env.ANGEL_API_KEY || "",
  clientCode: process.env.ANGEL_CLIENT_CODE || "",
  pin: process.env.ANGEL_PIN || "",
  totpSecret: process.env.ANGEL_TOTP_SECRET || "",
});
const hasCredentials = () => { const e = env(); return !!(e.apiKey && e.clientCode && e.pin && e.totpSecret); };

const istDay = (d) => new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });

function headers(withAuth = true) {
  const h = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": "127.0.0.1",
    "X-ClientPublicIP": "127.0.0.1",
    "X-MACAddress": "00:00:00:00:00:00",
    "X-PrivateKey": env().apiKey,
  };
  if (withAuth && session) h.Authorization = `Bearer ${session.jwtToken}`;
  return h;
}

function isAuthenticated() {
  return !!(session && session.jwtToken && istDay(session.saved_at) === istDay(new Date()));
}

function invalidate(reason) {
  if (session) console.warn("[angel] Session invalidated:", reason || "token rejected");
  session = null;
}

/** Restore today's session from token.json, if it was saved today (IST). */
function loadSavedToken() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return false;
    const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
    if (istDay(saved.saved_at) !== istDay(new Date())) return false;
    session = saved;
    console.log("[angel] Restored today's session.");
    return true;
  } catch (e) {
    console.warn("[angel] Could not restore saved session:", e.message);
    return false;
  }
}

/** Log in with client code, PIN and a fresh TOTP. */
async function login() {
  const e = env();
  if (!hasCredentials()) {
    throw new Error("Missing ANGEL_API_KEY, ANGEL_CLIENT_CODE, ANGEL_PIN or ANGEL_TOTP_SECRET");
  }
  const res = await axios.post(
    ROOT + ROUTES.login,
    { clientcode: e.clientCode, password: e.pin, totp: totp(e.totpSecret) },
    { headers: headers(false), timeout: 15000, validateStatus: () => true },
  );
  const d = res.data || {};
  if (!d.status || !d.data?.jwtToken) {
    throw new Error(d.message || `Angel One login failed (HTTP ${res.status})`);
  }
  session = {
    jwtToken: d.data.jwtToken,
    feedToken: d.data.feedToken,
    refreshToken: d.data.refreshToken,
    clientCode: e.clientCode,
    saved_at: new Date().toISOString(),
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(session, null, 2));
  console.log("[angel] Login complete.");
  return session;
}

/** Make sure a valid session exists: reuse today's, or log in with the env credentials. */
async function ensureLogin() {
  if (isAuthenticated()) return true;
  if (loadSavedToken() && isAuthenticated()) return true;
  if (!hasCredentials()) return false;
  try {
    await login();
    return true;
  } catch (err) {
    console.warn("[angel] Login failed:", err.message);
    return false;
  }
}

/** Authenticated REST call. Returns Angel's `data` field, or throws. */
async function call(method, route, body) {
  if (!isAuthenticated()) throw Object.assign(new Error("Not logged in to Angel One"), { status: 401 });
  const res = await axios({
    method, url: ROOT + route, headers: headers(), data: body, timeout: 15000, validateStatus: () => true,
  });
  const d = res.data || {};
  if (res.status === 401 || SESSION_ERRORS.has(d.errorcode)) {
    invalidate(d.message);
    throw Object.assign(new Error("Angel One session expired — it will log in again automatically"), { status: 401 });
  }
  if (!d.status) throw new Error(d.message || `Angel One request failed (HTTP ${res.status})`);
  return d.data;
}

module.exports = {
  ROUTES, call, login, ensureLogin, loadSavedToken, invalidate, isAuthenticated, hasCredentials,
  session: () => session,
  jwtToken: () => session?.jwtToken || null,
  feedToken: () => session?.feedToken || null,
  clientCode: () => env().clientCode,
  apiKey: () => env().apiKey,
};
