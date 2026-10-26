/** Holdings, positions and orders from Angel One. */
const broker = require("../config/broker");
const marketData = require("./marketData");

async function holdings() {
  if (!broker.isAuthenticated()) return [];
  return marketData.holdings();
}
async function positions() {
  if (!broker.isAuthenticated()) return { net: [], day: [] };
  return marketData.positions();
}
async function orders() {
  if (!broker.isAuthenticated()) return [];
  return marketData.orders();
}
module.exports = { holdings, positions, orders };
