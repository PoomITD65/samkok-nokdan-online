import React, { useEffect, useRef, useState } from 'react';

const TOAST_LIFETIME_MS = 4500;

/** Flashes newly-appended log lines as temporary toasts, so silent/automatic
 * effects (continuous tricks, triggered general abilities, etc.) are visible
 * without having to open the log panel. */
export default function EventToasts({ log }) {
  const [toasts, setToasts] = useState([]);
  const seenIds = useRef(new Set());
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      // Don't flash the entire history on first load/rejoin — just remember it.
      isFirstRun.current = false;
      for (const entry of log) seenIds.current.add(entry.id);
      return;
    }
    const fresh = log.filter((entry) => !seenIds.current.has(entry.id));
    if (fresh.length === 0) return;
    for (const entry of fresh) seenIds.current.add(entry.id);

    setToasts((prev) => [...prev, ...fresh]);
    for (const entry of fresh) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== entry.id));
      }, TOAST_LIFETIME_MS);
    }
  }, [log]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack">
      {toasts.slice(-4).map((t) => (
        <div key={t.id} className="toast">
          {t.textTh}
        </div>
      ))}
    </div>
  );
}
