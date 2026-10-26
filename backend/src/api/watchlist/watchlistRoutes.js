const express = require("express");
const controller = require("./watchlistController");
const validate = require("../../middleware/validate");

const router = express.Router();
router.get("/", controller.list);
router.post("/", validate({ symbol: "string" }), controller.add);
router.post("/bulk", async (req, res, next) => {
  try { res.json(await require("./watchlistService").bulkLoad(req.body?.count)); }
  catch (e) { next(e); }
});
router.get("/seed-status", (req, res) => res.json(require("../../services/historicalSeeder").status()));
router.post("/reset", (req, res) => res.json(require("./watchlistService").reset()));
router.delete("/:symbol", controller.remove);
module.exports = router;
