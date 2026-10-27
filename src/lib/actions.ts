import { usePlan } from '../store/planStore';
import { useGameData } from '../store/gameData';
import { useLineups, MAX_LINEUP_IMAGES } from '../store/lineupStore';
import { boardApi, exportBoardPng } from './boardApi';
import { planHasImages, planToShareUrl } from './share';
import { encodeImage } from './images';
import { uid } from './ids';
import type { ImageEl } from '../types';

/** Longest side of a freshly placed image, in board units (the map is 1000 across). */
const IMAGE_BOARD_SIZE = 220;

export async function addImageFiles(files: File[]) {
  const s = usePlan.getState();
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;
  const c = boardApi.viewCenter();
  const added: ImageEl[] = [];
  for (const [i, file] of images.entries()) {
    try {
      const { src, width, height } = await encodeImage(file, 1024);
      const k = IMAGE_BOARD_SIZE / Math.max(width, height);
      added.push({ id: uid(), kind: 'image', x: c.x + i * 24, y: c.y + i * 24, width: width * k, height: height * k, src });
    } catch (err) {
      s.showToast(err instanceof Error ? err.message : 'Could not read that image');
    }
  }
  if (!added.length) return;
  s.setTool('select');
  s.addElements(added);
}

export async function addLineupImages(files: File[]) {
  const lu = useLineups.getState();
  const draft = lu.draft;
  if (!draft) return;
  const room = MAX_LINEUP_IMAGES - draft.images.length;
  if (room <= 0) {
    usePlan.getState().showToast(`A lineup holds up to ${MAX_LINEUP_IMAGES} images`);
    return;
  }
  const srcs: string[] = [];
  for (const file of files.filter((f) => f.type.startsWith('image/')).slice(0, room)) {
    try {
      srcs.push((await encodeImage(file, 1280, 0.8)).src);
    } catch (err) {
      usePlan.getState().showToast(err instanceof Error ? err.message : 'Could not read that image');
    }
  }
  const current = useLineups.getState().draft;
  if (current && srcs.length) useLineups.getState().updateDraft({ images: [...current.images, ...srcs].slice(0, MAX_LINEUP_IMAGES) });
}

export async function copyShareLink() {
  const s = usePlan.getState();
  const url = planToShareUrl(s.plan);
  try {
    await navigator.clipboard.writeText(url);
    s.showToast(
      planHasImages(s.plan)
        ? 'Share link copied without images. Export a file from the Library to share them too.'
        : 'Share link copied. Anyone with it gets their own copy.',
    );
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
