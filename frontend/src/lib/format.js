const IST = "Asia/Kolkata";

/** ₹ amount in Indian grouping, with a true minus sign. */
export function inr(v, d = 0) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  const body = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${n < 0 ? "−" : ""}₹${body}`;
}

/** Price with two decimals. */
export function px(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(2);
}

/** Signed percentage. */
export function pct(v, d = 2) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${n.toFixed(d)}%`;
}

/** CSS tone class for a signed number. */
export function tone(v) {
  if (v == null || Number.isNaN(Number(v))) return "";
  return Number(v) > 0 ? "up" : Number(v) < 0 ? "down" : "";
}

/** Date + time in IST from a millisecond timestamp. */
export function timeIST(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-IN", {
    timeZone: IST, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/** Clock in IST, HH:MM. */
export function clockIST(d = new Date()) {
  return d.toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false });
}
