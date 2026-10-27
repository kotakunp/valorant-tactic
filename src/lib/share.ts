import LZString from 'lz-string';
import type { Plan } from '../types';
import { uid } from './ids';

const HASH_KEY = 'plan=';

export function planToShareUrl(plan: Plan) {
  const { id: _id, ...rest } = plan;
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
    return { ...data, id: uid(), updatedAt: Date.now() };
  } catch {
    return null;
  }
}

export function clearShareHash() {
  history.replaceState(null, '', location.pathname + location.search);
}
