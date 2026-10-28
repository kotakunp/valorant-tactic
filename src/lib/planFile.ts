import type { Plan } from '../types';
import { uid } from './ids';

const FORMAT = 'valo-tactic/plan';

const MEDIA_SRC = /^\/media\/[a-f0-9]{32}\.(webp|jpg|png)$/;

/** Embedded data URLs, or images uploaded to this site's own server. Nothing that makes the browser fetch a third-party URL. */
export function isAllowedImageSrc(src: unknown): src is string {
  return typeof src === 'string' && (src.startsWith('data:image/') || MEDIA_SRC.test(src));
}

/** Drops images from outside this site and any live-session credentials. */
export function sanitizePlan<T extends Pick<Plan, 'steps'>>(plan: T): T {
  const { live: _live, ...rest } = plan as T & { live?: unknown };
  return {
    ...(rest as T),
    steps: plan.steps.map((s) => ({
      ...s,
      elements: (Array.isArray(s.elements) ? s.elements : []).filter((el) => el.kind !== 'image' || isAllowedImageSrc(el.src)),
    })),
  };
}

export function downloadPlanFile(plan: Plan) {
  // Live-session tokens would let whoever gets the file edit the shared copy.
  const { live: _live, ...data } = plan;
  const blob = new Blob([JSON.stringify({ format: FORMAT, version: 1, plan: data }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${plan.title.replace(/[^\w\- ]+/g, '').trim() || 'strategy'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readPlanFile(file: File): Promise<Plan> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON');
  }
  const plan = (data as { format?: string; plan?: Plan })?.plan;
  if ((data as { format?: string })?.format !== FORMAT || !plan || typeof plan.mapId !== 'string' || !Array.isArray(plan.steps) || !plan.steps.length) {
    throw new Error('That file is not a Valo Tactic strategy');
  }
  // A fresh id keeps an imported copy from overwriting the original if both live in one library.
  return { ...sanitizePlan(plan), id: uid(), updatedAt: Date.now() };
}
