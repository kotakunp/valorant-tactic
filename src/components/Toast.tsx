import { useEffect, useState } from 'react';
import { usePlan } from '../store/planStore';

export default function Toast() {
  const toast = usePlan((s) => s.toast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    // Leave time to reach the button when there is one.
    const t = setTimeout(() => setVisible(false), toast.action ? 5000 : 2400);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className={`toast ${visible ? 'show' : ''} ${toast?.action ? 'has-action' : ''}`} role="status" aria-live="polite">
      <span>{toast?.message}</span>
      {toast?.action && (
        <button
          className="toast-action"
          tabIndex={visible ? 0 : -1}
          onClick={() => {
            setVisible(false);
            toast.action?.run();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
