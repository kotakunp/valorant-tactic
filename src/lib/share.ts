import LZString from 'lz-string';
import type { Plan } from '../types';
import { uid } from './ids';
import { sanitizePlan } from './planFile';

/** Images stored inside the plan itself; uploaded ones are just a short URL. */
const isEmbeddedImage = (el: Plan['steps'][number]['elements'][number]) => el.kind === 'image' && el.src.startsWith('data:');

export function planHasImages(plan: Plan) {
  return plan.steps.some((s) => s.elements.some(isEmbeddedImage));
}

const HASH_KEY = 'plan=';

export function planToShareUrl(plan: Plan) {
  // Embedded images would make the link far too long for chat apps; folders and tags are personal
  // organisation, and live-session tokens would hand out edit access.
  const { id: _id, folder: _folder, tags: _tags, live: _live, ...rest } = plan;
  rest.steps = rest.steps.map((s) => ({ ...s, elements: s.elements.filter((el) => !isEmbeddedImage(el)) }));
  const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(rest));
  return `${location.origin}${location.pathname}#${HASH_KEY}${encoded}`;
}

export function readSharedPlan(): Plan | null {
  const hash = location.hash.slice(1);
  if (!hash.startsWith(HASH_KEY)) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(hash.slice(HASH_KEY.length));
    if (!json) return null;
    const data = JSON.parse(json) as Omit<Plan, 'id'>;
    if (!data || typeof data.mapId !== 'string' || !Array.isArray(data.steps) || !data.steps.length) return null;
    return { ...sanitizePlan(data), id: uid(), updatedAt: Date.now() };
  } catch {
    return null;
  }
}

export function clearShareHash() {
  history.replaceState(null, '', location.pathname + location.search);
}
