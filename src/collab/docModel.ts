import * as Y from 'yjs';
import type { BoardEl, Plan, Step } from '../types';
import { isAllowedImageSrc } from '../lib/planFile';

/**
 * Shared document layout:
 *   meta:  Y.Map { title, mapId, side }
 *   steps: Y.Array of Y.Map { id, name, notes, elements: Y.Map<id, element>, order: Y.Array<id> }
 *
 * Each element is one plain value in its step's map, so concurrent edits to different pieces
 * merge and two edits to the same piece resolve last-writer-wins. `order` keeps drawing order.
 */

/** Transaction origin for this browser's edits; the undo manager tracks only these. */
export const LOCAL = 'valo-tactic:local';
/** Origin for writing a whole plan into an empty room; never undoable. */
export const SEED = 'valo-tactic:seed';

type YStep = Y.Map<unknown>;

export function roots(doc: Y.Doc) {
  return { meta: doc.getMap<unknown>('meta'), steps: doc.getArray<YStep>('steps') };
}

export function docIsEmpty(doc: Y.Doc) {
  return !roots(doc).meta.has('mapId');
}

function makeStep(step: Step): YStep {
  const m = new Y.Map<unknown>();
  m.set('id', step.id);
  m.set('name', step.name);
  m.set('notes', step.notes);
  const els = new Y.Map<BoardEl>();
  for (const el of step.elements) els.set(el.id, el);
  m.set('elements', els);
  m.set('order', Y.Array.from(step.elements.map((e) => e.id)));
  return m;
}

export function writeWholePlan(doc: Y.Doc, plan: Plan) {
  doc.transact(() => {
    const { meta, steps } = roots(doc);
    meta.set('title', plan.title);
    meta.set('mapId', plan.mapId);
    meta.set('side', plan.side);
    steps.delete(0, steps.length);
    steps.push(plan.steps.map(makeStep));
  }, SEED);
}

const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

function sameList<T>(a: T[], b: T[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function validElement(id: string, el: unknown): el is BoardEl {
  if (!el || typeof el !== 'object') return false;
  const e = el as BoardEl;
  if (e.id !== id || typeof e.kind !== 'string') return false;
  return e.kind !== 'image' || isAllowedImageSrc(e.src);
}

function stepParts(ys: YStep) {
  let els = ys.get('elements');
  let order = ys.get('order');
  if (!(els instanceof Y.Map)) ys.set('elements', (els = new Y.Map()));
  if (!(order instanceof Y.Array)) ys.set('order', (order = new Y.Array()));
  return { els: els as Y.Map<BoardEl>, order: order as Y.Array<string> };
}

function readElements(ys: YStep): BoardEl[] {
  const els = ys.get('elements');
  if (!(els instanceof Y.Map)) return [];
  const order = ys.get('order');
  const out: BoardEl[] = [];
  const used = new Set<string>();
  for (const id of order instanceof Y.Array ? (order.toArray() as string[]) : []) {
    if (used.has(id)) continue;
    const el = els.get(id);
    if (validElement(id, el)) {
      used.add(id);
      out.push(el);
    }
  }
  // Pieces missing from the order (a concurrent add raced a delete) go last, sorted so every browser agrees.
  for (const id of [...els.keys()].filter((k) => !used.has(k)).sort()) {
    const el = els.get(id);
    if (validElement(id, el)) out.push(el);
  }
  return out;
}

/**
 * The plan held in the document, reusing objects from `prev` wherever nothing changed so
 * React memos and later diffs stay cheap. Returns `prev` itself when the document matches it.
 */
export function readPlan(doc: Y.Doc, prev: Plan): Plan {
  const { meta, steps: ysteps } = roots(doc);
  const prevById = new Map(prev.steps.map((s) => [s.id, s]));
  const seen = new Set<string>();
  let steps: Step[] = [];
  for (const ys of ysteps.toArray()) {
    if (!(ys instanceof Y.Map)) continue;
    const id = str(ys.get('id'), '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const elements = readElements(ys);
    const name = str(ys.get('name'), 'Step');
    const notes = str(ys.get('notes'), '');
    const old = prevById.get(id);
    steps.push(old && old.name === name && old.notes === notes && sameList(old.elements, elements) ? old : { id, name, notes, elements });
  }
  if (!steps.length) steps = [prev.steps[0] ?? { id: 'step-1', name: 'Step 1', notes: '', elements: [] }];
  const title = str(meta.get('title'), prev.title);
  const mapId = str(meta.get('mapId'), prev.mapId);
  const side = meta.get('side') === 'defense' ? 'defense' : 'attack';
  const stepsSame = sameList(prev.steps, steps);
  if (stepsSame && title === prev.title && mapId === prev.mapId && side === prev.side) return prev;
  return { ...prev, title, mapId, side, steps: stepsSame ? prev.steps : steps, updatedAt: Date.now() };
}

function diffElements(ys: YStep, before: BoardEl[], after: BoardEl[]) {
  const { els, order } = stepParts(ys);
  const prev = new Map(before.map((e) => [e.id, e]));
  const nextIds = new Set(after.map((e) => e.id));
  for (const e of before) {
    if (nextIds.has(e.id)) continue;
    els.delete(e.id);
    const ids = order.toArray();
    for (let i = ids.length - 1; i >= 0; i--) if (ids[i] === e.id) order.delete(i, 1);
  }
  after.forEach((e, k) => {
    const old = prev.get(e.id);
    if (old === e) return;
    // Someone else deleted it while this edit was in flight; the deletion wins.
    if (old && !els.has(e.id)) return;
    els.set(e.id, e);
    if (!old) {
      const at = k > 0 ? order.toArray().lastIndexOf(after[k - 1].id) + 1 : 0;
      order.insert(at, [e.id]);
    }
  });
}

/** Writes what changed between two versions of the local plan into the document. */
export function applyDiff(doc: Y.Doc, base: Plan, next: Plan) {
  doc.transact(() => {
    const { meta, steps: ysteps } = roots(doc);
    if (base.title !== next.title) meta.set('title', next.title);
    if (base.mapId !== next.mapId) meta.set('mapId', next.mapId);
    if (base.side !== next.side) meta.set('side', next.side);
    if (base.steps === next.steps) return;

    const indexOf = (id: string) => ysteps.toArray().findIndex((ys) => ys instanceof Y.Map && ys.get('id') === id);
    const baseById = new Map(base.steps.map((s) => [s.id, s]));
    const nextIds = new Set(next.steps.map((s) => s.id));
    for (const s of base.steps) {
      if (nextIds.has(s.id)) continue;
      const i = indexOf(s.id);
      if (i >= 0) ysteps.delete(i, 1);
    }
    next.steps.forEach((step, k) => {
      const old = baseById.get(step.id);
      if (!old) {
        const at = k > 0 ? indexOf(next.steps[k - 1].id) + 1 : 0;
        ysteps.insert(at, [makeStep(step)]);
        return;
      }
      if (old === step) return;
      const i = indexOf(step.id);
      if (i < 0) return;
      const ys = ysteps.get(i);
      if (old.name !== step.name) ys.set('name', step.name);
      if (old.notes !== step.notes) ys.set('notes', step.notes);
      if (old.elements !== step.elements) diffElements(ys, old.elements, step.elements);
    });
  }, LOCAL);
}
