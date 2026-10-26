/**
 * Historical Seeder — fills candles for large universes WITHOUT
 * hammering Angel One's rate limit (~3 historical requests/second).
 *
 * The bulk-universe bug this fixes: 1500 symbols were subscribed to
 * live ticks but their history was never seeded, so every row showed
 * "warming" with no score/RSI/trend for hours. Now seeding runs in the
 * background at 1 request / 400ms (1500 symbols ≈ 10 minutes) and the
 * dashboard shows live progress. Symbols light up as they're seeded.
 */
const historical = require("./historicalDataService");
const strategy = require("../config/strategy");
const logger = require("../utils/logger");

let queue = [];
let running = false;
let done = 0, total = 0, failed = 0;
let io = null;

function setIO(i) { io = i; }
function status() { return { running, done, total, failed, remaining: queue.length }; }

function enqueue(tokens) {
  if (!historical.HAS_HIST) {
    logger.warn("[seeder] No historical subscription — candles will build from live ticks instead.");
    return status();
  }
  const fresh = tokens.filter(Boolean);
  queue.push(...fresh);
  total += fresh.length;
  if (!running) run();
  return status();
}

async function run() {
  running = true;
  logger.info(`[seeder] Seeding candles for ${queue.length} symbols (~${Math.ceil(queue.length * 0.4 / 60)} min at rate limit)…`);
  while (queue.length) {
    const token = queue.shift();
    try {
      const r = await historical.bootstrap(token, strategy.TIMEFRAME, 10);
      if (r.error) failed++;
    } catch { failed++; }
    done++;
    if (io && (done % 25 === 0 || queue.length === 0)) io.emit("seed:progress", status());
    if (done % 200 === 0) logger.info(`[seeder] ${done}/${total} seeded…`);
    await new Promise((r) => setTimeout(r, 400)); // ~2.5 req/s — under Angel One's 3/s cap
  }
  running = false;
  logger.info(`[seeder] Done: ${done - failed}/${total} seeded, ${failed} failed.`);
  if (io) io.emit("seed:progress", status());
}

module.exports = { enqueue, status, setIO };
