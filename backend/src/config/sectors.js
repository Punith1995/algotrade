/** Layer 10 — sector map for large caps, with the matching NSE sector index. */
const MAP = {
  BANK:   { index: "NIFTY BANK",       stocks: ["HDFCBANK","ICICIBANK","SBIN","AXISBANK","KOTAKBANK","INDUSINDBK","BANKBARODA","CANBK","AUBANK","IDFCFIRSTB","PNB","FEDERALBNK"] },
  IT:     { index: "NIFTY IT",         stocks: ["INFY","TCS","HCLTECH","TECHM","WIPRO","LTIM","PERSISTENT","COFORGE","MPHASIS"] },
  AUTO:   { index: "NIFTY AUTO",       stocks: ["MARUTI","M&M","TATAMOTORS","EICHERMOT","HEROMOTOCO","BAJAJ-AUTO","TVSMOTOR","ASHOKLEY"] },
  METAL:  { index: "NIFTY METAL",      stocks: ["TATASTEEL","JSWSTEEL","HINDALCO","VEDL","JINDALSTEL","NMDC","SAIL","COALINDIA"] },
  PHARMA: { index: "NIFTY PHARMA",     stocks: ["SUNPHARMA","CIPLA","DRREDDY","DIVISLAB","LUPIN","AUROPHARMA","TORNTPHARM","ZYDUSLIFE","APOLLOHOSP"] },
  FIN:    { index: "NIFTY FIN SERVICE",stocks: ["BAJFINANCE","BAJAJFINSV","SHRIRAMFIN","SBILIFE","HDFCLIFE","ICICIGI","CHOLAFIN"] },
  FMCG:   { index: "NIFTY FMCG",       stocks: ["ITC","HINDUNILVR","NESTLEIND","BRITANNIA","TATACONSUM","DABUR","GODREJCP"] },
  ENERGY: { index: "NIFTY ENERGY",     stocks: ["RELIANCE","NTPC","POWERGRID","ONGC","TATAPOWER","IOC","BPCL","GAIL","ADANIENT","ADANIPORTS"] },
  INFRA:  { index: "NIFTY INFRA",      stocks: ["LT","ULTRACEMCO","GRASIM","DLF","GODREJPROP","CUMMINSIND","BEL","VOLTAS","DIXON","TRENT","TITAN","ASIANPAINT"] },
};
const SYM2SEC = {};
for (const [sec, v] of Object.entries(MAP)) for (const s of v.stocks) SYM2SEC[s] = sec;

function sectorOf(sym) { return SYM2SEC[sym] || null; }
function indexOf(sym) { const s = SYM2SEC[sym]; return s ? MAP[s].index : null; }
function peersOf(sym) { const s = SYM2SEC[sym]; return s ? MAP[s].stocks.filter((x) => x !== sym) : []; }
module.exports = { MAP, sectorOf, indexOf, peersOf };
