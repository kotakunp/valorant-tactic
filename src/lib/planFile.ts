import type { Plan } from '../types';
import { uid } from './ids';

const FORMAT = 'valo-tactic/plan';

export function downloadPlanFile(plan: Plan) {
  const blob = new Blob([JSON.stringify({ format: FORMAT, version: 1, plan }, null, 2)], { type: 'application/json' });
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
  return { ...plan, id: uid(), updatedAt: Date.now() };
}
