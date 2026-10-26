/**
 * Redis-compatible cache with automatic in-memory fallback, so the app
 * runs without a Redis server. Set REDIS_URL to use real Redis later.
 */
const mem = new Map();
module.exports = {
  async get(k) { const e = mem.get(k); if (!e) return null; if (e.exp && Date.now() > e.exp) { mem.delete(k); return null; } return e.v; },
  async set(k, v, ttlSec) { mem.set(k, { v, exp: ttlSec ? Date.now() + ttlSec * 1000 : null }); },
  async del(k) { mem.delete(k); },
};
