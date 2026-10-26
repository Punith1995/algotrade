/** Socket.IO server — pushes live ticks + REST quotes + scanner results. */
const { Server } = require("socket.io");
const tickerService = require("../services/tickerService");
const quoteService = require("../services/quoteService");
const { getSymbol } = require("../services/instrumentService");

let io = null;

function init(httpServer, origin) {
  io = new Server(httpServer, { cors: { origin, methods: ["GET", "POST"] }, pingInterval: 25000, pingTimeout: 60000 });

  io.on("connection", (socket) => {
    console.log("[socket.io] Dashboard client connected:", socket.id);
    // send current quote snapshot immediately so prices show without waiting
    socket.on("disconnect", () => console.log("[socket.io] Client left:", socket.id));
  });

  let buffer = new Map();
  const lastLiveAt = new Map(); // symbol -> ts of last WEBSOCKET tick

  // Live ticks (authoritative during market hours)
  tickerService.onTicks((ticks) => {
    for (const t of ticks) {
      const symbol = getSymbol(t.instrument_token) || String(t.instrument_token);
      lastLiveAt.set(symbol, Date.now());
      buffer.set(symbol, {
        token: t.instrument_token, symbol,
        ltp: t.last_price, change: t.change,
        volume: t.volume_traded ?? t.volume ?? null,
        ohlc: t.ohlc || null, time: Date.now(), source: "live",
      });
    }
  });

  // REST quotes fill the gaps (off-hours, freshly added symbols).
  // Never overwrite a symbol that had a live tick in the last 10s.
  quoteService.onQuotes((quotes) => {
    for (const q of quotes) {
      const liveAt = lastLiveAt.get(q.symbol) || 0;
      if (Date.now() - liveAt < 10000) continue;
      buffer.set(q.symbol, q);
    }
  });

  setInterval(() => {
    if (buffer.size && io) {
      io.emit("ticks", [...buffer.values()]);
      buffer = new Map();
    }
  }, 1000);

  return io;
}

function getIO() { return io; }
module.exports = { init, getIO };
