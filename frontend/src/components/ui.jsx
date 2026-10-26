/** Shared UI primitives. */

export function Card({ title, sub, right, children, className = "", style }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || right) && (
        <div className="card-head">
          <div>
            {title && <div className="card-title">{title}</div>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone = "" }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className={`value ${tone}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </header>
  );
}

export function Badge({ signal, warming }) {
  if (warming) return <span className="badge WARM">WARMING</span>;
  const s = signal || "WAIT";
  return <span className={`badge ${s}`}>{s}</span>;
}

/** The six entry checks, in the order the engine evaluates them. */
export const CHECKS = [
  ["trend", "Trend", "EMA 20 > 50 > 200"],
  ["momentum", "Momentum", "RSI 55–70 and rising"],
  ["macd", "MACD", "MACD line above its signal"],
  ["breakout", "Breakout", "Fresh close above resistance"],
  ["volume", "Volume", "Breakout volume ≥ 1.5× average"],
  ["risk", "Risk", "Valid stop, size ≥ 1 share"],
];

/** Six compact pass/fail marks. */
export function CheckDots({ checks = {} }) {
  return (
    <span
      className="checks"
      title={CHECKS.map(([k, label]) => `${label}: ${checks[k] ? "pass" : "fail"}`).join("\n")}
    >
      {CHECKS.map(([k, label]) => (
        <span key={k} className={`ck ${checks[k] ? "ok" : "no"}`} aria-label={`${label} ${checks[k] ? "pass" : "fail"}`}>
          {checks[k] ? "✓" : "✗"}
        </span>
      ))}
    </span>
  );
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Confirm({ open, title, body, confirmLabel = "Confirm", danger = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="row-end">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? "danger" : ""}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
