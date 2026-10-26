const inr = (v) => (v == null ? "—" : "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const compact = (v) => (v == null ? "—" : Intl.NumberFormat("en-IN", { notation: "compact" }).format(v));
module.exports = { inr, compact };
