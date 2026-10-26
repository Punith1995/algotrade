/** Log of every alert sent (WhatsApp/Telegram/dashboard toast). */
const db = require("../db");
function record(entry) { db.push("alerts", { ...entry, time: entry.time || Date.now() }, 1000); }
function history(limit = 200) { return db.get("alerts").slice(-limit).reverse(); }
module.exports = { record, history };
