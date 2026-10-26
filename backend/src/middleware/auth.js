/** Optional API-key gate. Set APP_API_KEY in .env to enable; blank = open (local use). */
module.exports = (req, res, next) => {
  const key = process.env.APP_API_KEY;
  if (!key) return next();
  if (req.headers["x-api-key"] === key) return next();
  res.status(401).json({ error: "Missing or invalid x-api-key header" });
};
