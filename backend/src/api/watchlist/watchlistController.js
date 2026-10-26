const service = require("./watchlistService");
module.exports = {
  list: (req, res) => res.json(service.list()),
  add: (req, res, next) => { try { res.json(service.add(String(req.body.symbol || ""))); } catch (e) { next(e); } },
  remove: (req, res, next) => { try { res.json(service.remove(req.params.symbol)); } catch (e) { next(e); } },
};
