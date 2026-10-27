import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatCombo } from '../lib/shortcuts';

interface TipState {
  label: string;
  combos: string[][];
  side: 'top' | 'bottom' | 'left' | 'right';
  rect: DOMRect;
}

const SHOW_DELAY = 280;
const GAP = 8;

/** One floating tooltip for every element with data-tip; portalled so sidebars and toolbars can't clip it. */
export default function TooltipLayer() {
  const [tipState, setTip] = useState<TipState | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(0);
  const current = useRef<Element | null>(null);

  useEffect(() => {
    const show = (el: HTMLElement, immediate: boolean) => {
      window.clearTimeout(timer.current);
      current.current = el;
      const open = () => {
        if (current.current !== el || !el.isConnected) return;
        const label = el.dataset.tip ?? '';
        const keys = el.dataset.tipKeys;
        setTip({
          label,
          combos: keys ? keys.split(' | ').map(formatCombo) : [],
          side: (el.dataset.tipSide as TipState['side']) ?? 'bottom',
          rect: el.getBoundingClientRect(),
        });
      };
      if (immediate) open();
      else timer.current = window.setTimeout(open, SHOW_DELAY);
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      current.current = null;
      setTip(null);
      setPos(null);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (el === current.current) return;
      if (!el) return hide();
      // Moving between neighbouring buttons feels instant once one tooltip is already up.
      show(el, !!current.current && tipState !== null);
    };
    const focus = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (el && (e.target as HTMLElement).matches(':focus-visible')) show(el, true);
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    window.addEventListener('blur', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      window.removeEventListener('blur', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [tipState]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!tipState || !node) return;
    const { rect } = tipState;
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let side = tipState.side;
    if (side === 'bottom' && rect.bottom + GAP + h > vh) side = 'top';
    if (side === 'top' && rect.top - GAP - h < 0) side = 'bottom';
    if (side === 'right' && rect.right + GAP + w > vw) side = 'left';
    if (side === 'left' && rect.left - GAP - w < 0) side = 'right';
    let left = 0;
    let top = 0;
    if (side === 'bottom' || side === 'top') {
      left = rect.left + rect.width / 2 - w / 2;
      top = side === 'bottom' ? rect.bottom + GAP : rect.top - GAP - h;
    } else {
      top = rect.top + rect.height / 2 - h / 2;
      left = side === 'right' ? rect.right + GAP : rect.left - GAP - w;
    }
    setPos({ left: Math.max(6, Math.min(vw - w - 6, left)), top: Math.max(6, Math.min(vh - h - 6, top)) });
  }, [tipState]);

  if (!tipState) return null;
  return (
    <div
      ref={ref}
      className="tooltip"
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      <span>{tipState.label}</span>
      {tipState.combos.length > 0 && (
        <span className="tooltip-keys">
          {tipState.combos.map((combo, i) => (
            <span key={i} className="combo">
              {i > 0 && <span className="or">or</span>}
              {combo.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
