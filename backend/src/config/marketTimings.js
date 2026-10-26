/** NSE market hours (IST). */
function nowIST() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}
function isMarketOpen() {
  const d = nowIST();
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const mins = d.getHours() * 60 + d.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}
module.exports = { isMarketOpen, nowIST };
