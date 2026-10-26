/** Analyze a single watchlist symbol on demand. */
const scanner = require("../engine/scannerEngine");
module.exports = { analyze: (symbol) => scanner.analyzeSymbol(symbol) };
