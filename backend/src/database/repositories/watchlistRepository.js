const db = require("../db");
module.exports = {
  load: (fallback) => db.get("watchlist") || fallback,
  save: (list) => db.set("watchlist", list),
};
