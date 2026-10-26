/** Tiny body validator: validate({ symbol: "string" }) */
module.exports = (shape) => (req, res, next) => {
  for (const [field, type] of Object.entries(shape)) {
    const v = req.body?.[field];
    if (v == null || typeof v !== type) {
      return res.status(400).json({ error: `Field "${field}" (${type}) is required` });
    }
  }
  next();
};
