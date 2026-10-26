import { useNotificationStore } from "../store/notificationStore";

/** Non-blocking notifications (max three visible, auto-dismiss). */
export default function Toasts() {
  const { toasts, dismiss, clearToasts } = useNotificationStore();
  if (!toasts.length) return null;

  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.length > 1 && (
        <button className="btn ghost sm" style={{ alignSelf: "flex-end", pointerEvents: "auto" }} onClick={clearToasts}>
          Clear all
        </button>
      )}
      {toasts.map((t) => (
        <div key={t.id} className="toast" style={{ borderLeftColor: t.headColor || "var(--accent)" }}>
          <button className="t-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">✕</button>
          <div className="t-title" style={{ color: t.headColor || "var(--text)" }}>{t.title}</div>
          {t.body && <div className="t-body">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}
