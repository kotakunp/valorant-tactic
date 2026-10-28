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
const SHARE_PATH = /^\/s\/([A-Za-z0-9_-]{10})\/?$/;

/** Folders and tags are personal organisation, and live-session tokens would hand out edit access. */
function sharedFields(plan: Plan) {
  const { id: _id, folder: _folder, tags: _tags, live: _live, ...rest } = plan;
  return rest;
}

/** The offline fallback: the whole strategy compressed into the link. */
export function planToShareUrl(plan: Plan) {
  const rest = sharedFields(plan);
  // Embedded images would make the link far too long for chat apps.
  rest.steps = rest.steps.map((s) => ({ ...s, elements: s.elements.filter((el) => !isEmbeddedImage(el)) }));
  const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(rest));
  return `${location.origin}/#${HASH_KEY}${encoded}`;
}

/** Stores a frozen copy on the server, images included, and returns a short `/s/…` link. */
export async function createShortShareUrl(plan: Plan): Promise<string> {
  const res = await fetch('/api/shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sharedFields(plan)),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Share failed (${res.status})`);
  const { id } = (await res.json()) as { id: string };
  return `${location.origin}/s/${id}`;
}

function toPlan(data: unknown): Plan | null {
  const d = data as Omit<Plan, 'id'> | null;
  if (!d || typeof d.mapId !== 'string' || !Array.isArray(d.steps) || !d.steps.length) return null;
  return { ...sanitizePlan(d), id: uid(), updatedAt: Date.now() };
}

export type SharedLink = { kind: 'hash'; plan: Plan | null } | { kind: 'short'; id: string };

/** What the current URL shares, if anything. */
export function readShareLink(): SharedLink | null {
  const short = location.pathname.match(SHARE_PATH);
  if (short) return { kind: 'short', id: short[1] };
  const hash = location.hash.slice(1);
  if (!hash.startsWith(HASH_KEY)) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(hash.slice(HASH_KEY.length));
    return { kind: 'hash', plan: json ? toPlan(JSON.parse(json)) : null };
  } catch {
    return { kind: 'hash', plan: null };
  }
}

/** null when the link doesn't exist; throws when the server can't be reached. */
export async function fetchSharedPlan(id: string): Promise<Plan | null> {
  const res = await fetch(`/api/shares/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Share lookup failed (${res.status})`);
  return toPlan(await res.json());
}

export function clearShareLink() {
  history.replaceState(null, '', SHARE_PATH.test(location.pathname) ? '/' : location.pathname + location.search);
}
