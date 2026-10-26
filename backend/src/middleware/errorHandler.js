const logger = require("../utils/logger");
module.exports = (err, req, res, next) => {
  logger.error(req.method, req.path, "-", err.message);
  res.status(err.status || 500).json({ error: err.message || "Internal error" });
};
