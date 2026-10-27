import { usePlan } from '../store/planStore';

const HOLD_MS = 450;
const MOVE_MS = 1200;
let raf = 0;

export function stopPlayback() {
  cancelAnimationFrame(raf);
  usePlan.setState({ playback: null });
}

/** Animates through every step: hold on a step briefly, then tween to the next. */
export function togglePlayback() {
  const s = usePlan.getState();
  if (s.playback) return stopPlayback();
  const n = s.plan.steps.length;
  if (n < 2) {
    s.showToast('Add a second step to animate the strategy');
    return;
  }
  let i = 0;
  let start = performance.now();
  usePlan.setState({ stepIndex: 0, selectedId: null, playback: { from: 0, to: 1, t: 0 } });
  const tick = (now: number) => {
    const t = Math.max(0, (now - start - HOLD_MS) / MOVE_MS);
    if (t >= 1) {
      i += 1;
      if (i >= n - 1) {
        usePlan.setState({ playback: null, stepIndex: n - 1 });
        return;
      }
      start = now;
      usePlan.setState({ stepIndex: i, playback: { from: i, to: i + 1, t: 0 } });
    } else {
      usePlan.setState({ stepIndex: t > 0 ? i + 1 : i, playback: { from: i, to: i + 1, t } });
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
