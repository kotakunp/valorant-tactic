import { usePlan } from '../store/planStore';
import { useGameData } from '../store/gameData';
import { useLineups, MAX_LINEUP_IMAGES } from '../store/lineupStore';
import { boardApi, exportBoardPng } from './boardApi';
import { createShortShareUrl, planHasImages, planToShareUrl } from './share';
import { encodeImage } from './images';
import { uid } from './ids';
import type { BoardEl, ImageEl } from '../types';
import { OBJECTS } from './objects';
import { dataUrlToBlob, uploadImage } from '../collab/api';
import { liveRoomToken } from '../collab/session';

/** Longest side of a freshly placed image, in board units (the map is 1000 across). */
const IMAGE_BOARD_SIZE = 220;

export async function addImageFiles(files: File[]) {
  const s = usePlan.getState();
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;
  const c = boardApi.viewCenter();
  const added: ImageEl[] = [];
  const live = liveRoomToken();
  for (const [i, file] of images.entries()) {
    try {
      const encoded = await encodeImage(file, 1024);
      const { width, height } = encoded;
      // In a live session the image goes to the server so every sync doesn't carry it.
      const src = live ? await uploadImage(live.room, live.token, await dataUrlToBlob(encoded.src)) : encoded.src;
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

const KIND_NAMES: Record<BoardEl['kind'], [string, string]> = {
  agent: ['agent', 'agents'],
  ability: ['ability', 'abilities'],
  object: ['marker', 'markers'],
  stroke: ['drawing', 'drawings'],
  text: ['note', 'notes'],
  area: ['area', 'areas'],
  rect: ['zone', 'zones'],
  polygon: ['zone', 'zones'],
  image: ['image', 'images'],
};

/** "Jett", "Jett's Updraft", "3 abilities", "5 pieces". */
export function describePieces(els: BoardEl[]): string {
  const { agentsById } = useGameData.getState();
  if (els.length === 1) {
    const el = els[0];
    if (el.kind === 'agent') return agentsById[el.agentId]?.displayName ?? 'agent';
    if (el.kind === 'ability') {
      const agent = agentsById[el.agentId];
      const ability = agent?.abilities.find((a) => a.slot === el.slot);
      return ability ? `${agent.displayName}'s ${ability.displayName}` : 'ability';
    }
    if (el.kind === 'object') return `${OBJECTS.find((o) => o.kind === el.object)?.label ?? 'marker'} marker`;
    return KIND_NAMES[el.kind][0];
  }
  const names = new Set(els.map((e) => KIND_NAMES[e.kind][1]));
  return names.size === 1 ? `${els.length} ${[...names][0]}` : `${els.length} pieces`;
}

/** Removes pieces from the current step and offers a one-click undo. */
export function removePieces(ids: string[]) {
  const s = usePlan.getState();
  const step = s.plan.steps[s.stepIndex];
  const wanted = new Set(ids);
  const els = step?.elements.filter((e) => wanted.has(e.id)) ?? [];
  if (!els.length) return;
  s.removeElements(els.map((e) => e.id));
  const after = usePlan.getState().plan.steps[usePlan.getState().stepIndex];
  // A refused edit (view-only live link) has already shown its own message.
  if (after?.elements.some((e) => wanted.has(e.id))) return;
  s.showToast(`Removed ${describePieces(els)}`, { label: 'Undo', run: () => usePlan.getState().undo() });
}

/**
 * Copies text that is still being produced. Browsers only allow clipboard writes shortly after a click,
 * so the pending text goes straight into a ClipboardItem where that's supported.
 */
async function copyPending(text: Promise<string>): Promise<boolean> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })]);
      return true;
    } catch {
      // Older engines reject promised clipboard items; try plain text below.
    }
  }
  try {
    await navigator.clipboard.writeText(await text);
    return true;
  } catch {
    return false;
  }
}

let sharing = false;

export async function copyShareLink() {
  if (sharing) return;
  sharing = true;
  const s = usePlan.getState();
  const plan = s.plan;
  let offline = false;
  const link = createShortShareUrl(plan).catch(() => {
    offline = true;
    return planToShareUrl(plan);
  });
  try {
    const copied = await copyPending(link);
    const url = await link;
    if (!copied) {
      window.prompt('Copy this share link', url);
      return;
    }
    s.showToast(
      !offline
        ? 'Share link copied. Anyone with it gets their own copy.'
        : planHasImages(plan)
          ? "Couldn't reach the server, so this is a long link without images."
          : "Couldn't reach the server, so this is a long offline link.",
    );
  } finally {
    sharing = false;
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
