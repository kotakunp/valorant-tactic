import { usePlan } from '../store/planStore';
import { useGameData } from '../store/gameData';
import { exportBoardPng } from './boardApi';
import { planToShareUrl } from './share';

export async function copyShareLink() {
  const s = usePlan.getState();
  const url = planToShareUrl(s.plan);
  try {
    await navigator.clipboard.writeText(url);
    s.showToast('Share link copied. Anyone with it gets their own copy.');
  } catch {
    window.prompt('Copy this share link', url);
  }
}

export function exportPng() {
  const s = usePlan.getState();
  const map = useGameData.getState().mapsById[s.plan.mapId];
  s.select(null);
  requestAnimationFrame(() => {
    const ok = exportBoardPng(`${s.plan.title} - ${map?.displayName ?? 'map'} - step ${s.stepIndex + 1}`);
    s.showToast(ok ? 'PNG exported' : 'PNG export is unavailable: an image failed to load securely');
  });
}

export function startNewPlan() {
  const s = usePlan.getState();
  s.newPlan(s.plan.mapId);
  s.showToast('New strategy started. The previous one is in your Library.');
}
