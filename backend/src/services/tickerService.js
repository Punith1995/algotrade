/**
 * Live tick stream via Angel One SmartAPI WebSocket V2.
 *
 * Angel ticks are converted to the shape candleBuilder reads:
 *   { instrument_token, last_price, volume_traded }
 * instrument_token is the app token, e.g. "NSE:SBIN-EQ".
 * Angel sends prices in paise, so they are divided by 100.
 *
 * The SDK does not reconnect on its own, so this module watches the message
 * flow during market hours and opens a new connection if ticks stop.
 */
const { WebSocketV2 } = require("smartapi-javascript");
const broker = require("../config/broker");
const { angelTokenOf, internalOf, NIFTY50_TOKEN, BANKNIFTY_TOKEN } = require("./instrumentService");
const candleBuilder = require("./candleBuilder");
const logger = require("../utils/logger");

const EXCHANGE_NSE_CM = 1;   // Angel exchange code for NSE cash
const MODE_SNAP_QUOTE = 3;   // full quote incl. cumulative volume
const ACTION_SUBSCRIBE = 1;
const ACTION_UNSUBSCRIBE = 0;
const CHUNK = 50;            // max tokens per subscribe request
const STALL_MS = 120000;     // no ticks for 2 min during market hours → reconnect
const WATCH_MS = 30000;

let ws = null;
let live = false;            // true once ticks are arriving
let lastMessageAt = 0;
let watchTimer = null;
let seq = 0;
let textLogs = 0;
const subscribed = new Set();  // app tokens
const lastTicks = new Map();
const listeners = [];

function onTicks(cb) { listeners.push(cb); }

function sendTokens(action, appTokens) {
  if (!ws) return;
  const tokens = appTokens.map(angelTokenOf).filter(Boolean);
  for (let i = 0; i < tokens.length; i += CHUNK) {
    ws.fetchData({
      correlationID: `ad${Date.now()}${seq++}`,
      action,
      mode: MODE_SNAP_QUOTE,
      exchangeType: EXCHANGE_NSE_CM,
      tokens: tokens.slice(i, i + CHUNK),
    });
  }
}

function createTicker() {
  if (!broker.isAuthenticated()) { logger.error("[ticker] Not logged in to Angel One yet."); return; }
  if (ws) { try { ws.close(); } catch { /* already closed */ } }
  live = false;
  ws = new WebSocketV2({
    clientcode: broker.clientCode(),
    jwttoken: broker.jwtToken(),
    apikey: broker.apiKey(),
    feedtype: broker.feedToken(),
  });

  ws.on("tick", (m) => {
    // Non-tick messages (subscribe acks, errors) arrive as raw text. Log the first few.
    if (typeof m === "string") {
      if (textLogs < 5) { textLogs++; logger.warn(`[ticker] Server message: ${m.slice(0, 300)}`); }
      return;
    }
    const id = internalOf(String(m?.token ?? "").replace(/\0/g, "").trim());
    if (!id) return;
    const price = Number(m.last_traded_price) / 100;   // paise → rupees
    if (!Number.isFinite(price) || price <= 0) return;
    const tick = { instrument_token: id, last_price: price, volume_traded: m.vol_traded ?? null };
    live = true;
    lastMessageAt = Date.now();
    lastTicks.set(id, tick);
    candleBuilder.ingestTick(tick, new Date());
    for (const cb of listeners) cb([tick]);
  });

  // Subscriptions made before the socket opens are replayed by the SDK on open.
  sendTokens(ACTION_SUBSCRIBE, [...subscribed]);
  lastMessageAt = Date.now();
  ws.connect().catch((err) => logger.error("[ticker] Connection error:", err?.message || String(err)));
  logger.info(`[ticker] Connecting — ${subscribed.size} symbols requested.`);
  startWatch();
}

/** Reconnect during market hours if the tick stream has gone quiet. */
function startWatch() {
  if (watchTimer) return;
  watchTimer = setInterval(() => {
    if (!broker.isAuthenticated() || !ws) return;
    const marketHours = isMarketHours();
    if (marketHours && Date.now() - lastMessageAt > STALL_MS) {
      logger.warn("[ticker] No ticks for 2 minutes — reconnecting.");
      createTicker();
    }
  }, WATCH_MS);
}

function isMarketHours() {
  const ist = new Date(Date.now() + 19800000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const weekday = ist.getUTCDay();
  return weekday >= 1 && weekday <= 5 && mins >= 555 && mins <= 930;   // 09:15–15:30
}

function start(tokens) {
  [...tokens, NIFTY50_TOKEN, BANKNIFTY_TOKEN].forEach((t) => subscribed.add(t));
  createTicker();
}

/** Recreate the connection with the fresh session (after a new daily login). */
function restart(tokens = []) {
  [...tokens, NIFTY50_TOKEN, BANKNIFTY_TOKEN].forEach((t) => subscribed.add(t));
  createTicker();
}

function subscribe(tokens) {
  const fresh = tokens.filter((t) => !subscribed.has(t));
  if (!fresh.length) return;
  fresh.forEach((t) => subscribed.add(t));
  sendTokens(ACTION_SUBSCRIBE, fresh);
}

function unsubscribe(tokens) {
  const drop = tokens.filter((t) => t !== NIFTY50_TOKEN && t !== BANKNIFTY_TOKEN);
  drop.forEach((t) => { subscribed.delete(t); lastTicks.delete(t); });
  sendTokens(ACTION_UNSUBSCRIBE, drop);
}

function getLastTick(token) { return lastTicks.get(token) || null; }
function isConnected() { return live; }

/** Milliseconds since the last tick (or connection attempt). null if never started. */
function msSinceLastTick() {
  return lastMessageAt ? Date.now() - lastMessageAt : null;
}

module.exports = { start, restart, subscribe, unsubscribe, onTicks, getLastTick, isConnected, msSinceLastTick };
