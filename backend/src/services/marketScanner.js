/** Full-universe scan pass (folder-structure contract; delegates to scannerEngine). */
const scanner = require("../engine/scannerEngine");
module.exports = { scan: () => scanner.scanOnce() };
