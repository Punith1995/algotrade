const db = require("../db");
module.exports = {
  getSettings: () => db.get("settings") || {},
  saveSettings: (s) => db.set("settings", s),
};
