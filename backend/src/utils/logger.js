/** Minimal leveled logger with IST timestamps. */
function ts() { return new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }); }
const logger = {
  info: (...a) => console.log(`[${ts()}]`, ...a),
  warn: (...a) => console.warn(`[${ts()}] ⚠`, ...a),
  error: (...a) => console.error(`[${ts()}] ✖`, ...a),
};
module.exports = logger;
