import { useEffect, useState } from 'react';
import { usePlan } from '../store/planStore';

export default function Toast() {
  const toast = usePlan((s) => s.toast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className={`toast ${visible ? 'show' : ''}`} role="status" aria-live="polite">
      {toast?.message}
    </div>
  );
}
