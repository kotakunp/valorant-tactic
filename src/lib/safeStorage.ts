import { createJSONStorage } from 'zustand/middleware';

let onFull: (message: string) => void = () => {};
let warnedAt = 0;

/** Called with a user-facing message when the browser refuses a write. */
export function onStorageFull(handler: (message: string) => void) {
  onFull = handler;
}

/**
 * localStorage throws once its ~5 MB quota is used up (images make that reachable). Persist
 * would otherwise fail silently, so the user is told before they lose work on tab close.
 */
export function safeJSONStorage<S>() {
  return createJSONStorage<S>(() => ({
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        const now = Date.now();
        if (now - warnedAt < 8000) return;
        warnedAt = now;
        onFull('Browser storage is full, so this change was not saved. Delete images or old strategies, or export a file.');
      }
    },
    removeItem: (key) => localStorage.removeItem(key),
  }));
}
