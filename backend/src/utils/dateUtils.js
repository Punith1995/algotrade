function nowIST() { return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })); }
function todayIST() { return nowIST().toISOString().slice(0, 10); }
function minutesSinceOpen() {
  const d = nowIST();
  return d.getHours() * 60 + d.getMinutes() - (9 * 60 + 15);
}
module.exports = { nowIST, todayIST, minutesSinceOpen };
