import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import { create } from 'zustand';
import { collabBridge, makePlan, usePlan } from '../store/planStore';
import type { LiveLink, Plan, Point } from '../types';
import { LOCAL, SEED, applyDiff, docIsEmpty, readPlan, roots, writeWholePlan } from './docModel';
import { clearRoomLink, collabSocketUrl, createRoom, dataUrlToBlob, readRoomLink, uploadImage } from './api';
import { displayName, useProfile } from './profile';

export interface Peer {
  id: number;
  name: string;
  color: string;
  step: number;
  cursor: Point | null;
  selected: string | null;
  drag: (Point & { id: string }) | null;
}

export type CollabStatus = 'off' | 'connecting' | 'connected' | 'offline';

interface CollabState {
  active: boolean;
  room: string | null;
  status: CollabStatus;
  /** The document is loaded (from the server or this browser's offline copy) and edits are accepted. */
  ready: boolean;
  role: 'edit' | 'view' | null;
  peers: Peer[];
  canUndo: boolean;
  canRedo: boolean;
  /** Local edits the server hasn't confirmed yet. */
  unsynced: boolean;
}

const OFF: CollabState = { active: false, room: null, status: 'off', ready: false, role: null, peers: [], canUndo: false, canRedo: false, unsynced: false };

export const useCollab = create<CollabState>(() => OFF);

interface Session {
  key: string;
  planId: string;
  room: string;
  doc: Y.Doc;
  idb: IndexeddbPersistence;
  provider: HocuspocusProvider | null;
  undo: Y.UndoManager | null;
  /** The plan the document matched after the last sync in either direction. */
  base: Plan | null;
  ready: boolean;
  destroyed: boolean;
  flushTimer: ReturnType<typeof setTimeout> | null;
  remoteQueued: boolean;
}

let session: Session | null = null;

/** Access this browser already had to a room, restored if a newly opened link for it turns out to be invalid. */
let fallback: { planId: string; live: LiveLink } | null = null;

// ---------- local -> document ----------

function flushLocal(plan = usePlan.getState().plan) {
  const s = session;
  if (!s?.ready || !s.base) return;
  if (s.flushTimer) {
    clearTimeout(s.flushTimer);
    s.flushTimer = null;
  }
  if (plan.id !== s.planId || plan === s.base) return;
  if (useCollab.getState().role !== 'view') applyDiff(s.doc, s.base, plan);
  s.base = plan;
}

function scheduleFlush() {
  const s = session;
  if (!s?.ready || s.flushTimer) return;
  // Batches the bursts of store updates a single gesture can produce into one document update.
  s.flushTimer = setTimeout(() => {
    s.flushTimer = null;
    flushLocal();
  }, 30);
}

// ---------- document -> local ----------

function pullRemote(s: Session) {
  if (s.remoteQueued) return;
  s.remoteQueued = true;
  queueMicrotask(() => {
    s.remoteQueued = false;
    if (s.destroyed || session !== s) return;
    // Pending local edits go in first so reading the document can't drop them.
    flushLocal();
    const store = usePlan.getState();
    if (store.plan.id !== s.planId) return;
    const next = readPlan(s.doc, store.plan);
    s.base = next;
    if (next !== store.plan) store.applyRemotePlan(next);
  });
}

function updateUndoState() {
  const u = session?.undo;
  useCollab.setState({ canUndo: !!u?.canUndo(), canRedo: !!u?.canRedo() });
}

function becomeReady(s: Session) {
  if (s.ready || s.destroyed) return;
  const store = usePlan.getState();
  if (store.plan.id !== s.planId) return;
  if (docIsEmpty(s.doc)) {
    // A brand-new room: whoever opens it first with edit rights fills it with their plan.
    if (useCollab.getState().role !== 'view') writeWholePlan(s.doc, store.plan);
    s.base = store.plan;
  } else {
    const next = readPlan(s.doc, store.plan);
    s.base = next;
    if (next !== store.plan) store.applyRemotePlan(next);
  }
  s.ready = true;
  const { meta, steps } = roots(s.doc);
  s.undo = new Y.UndoManager([meta, steps], { trackedOrigins: new Set([LOCAL]), captureTimeout: 600 });
  s.undo.on('stack-item-added', updateUndoState);
  s.undo.on('stack-item-popped', updateUndoState);
  s.undo.on('stack-cleared', updateUndoState);
  useCollab.setState({ ready: true });
}

// ---------- presence ----------

let cursor: Point | null = null;
let drag: (Point & { id: string }) | null = null;
let presenceTimer: ReturnType<typeof setTimeout> | null = null;

function sendPresence() {
  presenceTimer = null;
  const aw = session?.provider?.awareness;
  if (!aw) return;
  const { stepIndex, selectedId } = usePlan.getState();
  const { name, color } = useProfile.getState();
  aw.setLocalState({ user: { name: displayName(name), color }, step: stepIndex, sel: selectedId, cursor, drag });
}

function schedulePresence(now = false) {
  if (now) {
    if (presenceTimer) clearTimeout(presenceTimer);
    sendPresence();
    return;
  }
  if (!presenceTimer) presenceTimer = setTimeout(sendPresence, 50);
}

/** Board coordinates of this user's pointer, or null when it leaves the map. */
export function reportCursor(p: Point | null) {
  if (!session) return;
  cursor = p ? { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 } : null;
  schedulePresence(!p);
}

/** Where a piece this user is dragging is right now, so others see it move before it's dropped. */
export function reportDrag(d: (Point & { id: string }) | null) {
  if (!session) return;
  drag = d ? { id: d.id, x: Math.round(d.x * 10) / 10, y: Math.round(d.y * 10) / 10 } : null;
  schedulePresence(!d);
}

function readPeers(s: Session) {
  const aw = s.provider?.awareness;
  if (!aw) return;
  const peers: Peer[] = [];
  aw.getStates().forEach((state, id) => {
    if (id === s.doc.clientID || !state?.user) return;
    const u = state.user as { name?: unknown; color?: unknown };
    peers.push({
      id,
      name: displayName(typeof u.name === 'string' ? u.name.slice(0, 24) : ''),
      color: typeof u.color === 'string' && /^#[0-9a-f]{6}$/i.test(u.color) ? u.color : '#ece8e1',
      step: typeof state.step === 'number' ? state.step : 0,
      cursor: isPoint(state.cursor) ? { x: state.cursor.x, y: state.cursor.y } : null,
      selected: typeof state.sel === 'string' ? state.sel : null,
      drag: isPoint(state.drag) && typeof state.drag.id === 'string' ? { id: state.drag.id, x: state.drag.x, y: state.drag.y } : null,
    });
  });
  peers.sort((a, b) => a.id - b.id);
  useCollab.setState({ peers });
}

function isPoint(v: unknown): v is Point & Record<string, unknown> {
  return !!v && typeof v === 'object' && Number.isFinite((v as Point).x) && Number.isFinite((v as Point).y);
}

// ---------- lifecycle ----------

const keyFor = (plan: Plan) => (plan.live ? `${plan.id}|${plan.live.room}|${plan.live.token}` : null);

function join(plan: Plan) {
  const live = plan.live!;
  const doc = new Y.Doc();
  const s: Session = {
    key: keyFor(plan)!,
    planId: plan.id,
    room: live.room,
    doc,
    // Keeps an offline copy, so edits made without a connection survive a reload and sync later.
    idb: new IndexeddbPersistence(`valo-tactic:room:${live.room}`, doc),
    provider: null,
    undo: null,
    base: null,
    ready: false,
    destroyed: false,
    flushTimer: null,
    remoteQueued: false,
  };
  session = s;
  collabBridge.active = true;
  useCollab.setState({ ...OFF, active: true, room: live.room, status: 'connecting', role: live.role ?? null });

  doc.on('afterTransaction', (tr: Y.Transaction) => {
    if (!s.ready || tr.origin === LOCAL || tr.origin === SEED || !tr.changed.size) return;
    pullRemote(s);
  });

  s.idb.whenSynced.then(() => {
    if (s.destroyed) return;
    if (!docIsEmpty(doc)) becomeReady(s);
    s.provider = new HocuspocusProvider({
      url: collabSocketUrl(),
      name: live.room,
      document: doc,
      token: live.token,
      onStatus: ({ status }) => {
        if (s.destroyed) return;
        useCollab.setState({ status: status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'offline' });
      },
      onAuthenticated: ({ scope }) => {
        if (s.destroyed) return;
        const role = scope === 'readonly' ? 'view' : 'edit';
        if (fallback?.planId === s.planId) fallback = null;
        useCollab.setState({ role });
        const current = usePlan.getState().plan;
        if (current.id === s.planId && current.live && current.live.role !== role) usePlan.getState().setLive({ ...current.live, role });
      },
      onAuthenticationFailed: () => {
        if (s.destroyed) return;
        const store = usePlan.getState();
        const restore = fallback?.planId === s.planId && fallback.live.token !== live.token ? fallback.live : undefined;
        fallback = null;
        leave();
        if (store.plan.id === s.planId) store.setLive(restore);
        store.showToast(restore ? 'That live link is invalid. Reconnecting with the access you already had.' : 'That live link is invalid. This strategy is now a local copy.');
      },
      onSynced: () => {
        if (!s.destroyed) becomeReady(s);
      },
      onAwarenessChange: () => {
        if (!s.destroyed) readPeers(s);
      },
      onUnsyncedChanges: ({ number }) => {
        if (!s.destroyed) useCollab.setState({ unsynced: number > 0 });
      },
    });
    schedulePresence(true);
  });
}

function leave() {
  const s = session;
  if (!s) return;
  s.destroyed = true;
  if (s.flushTimer) clearTimeout(s.flushTimer);
  s.undo?.destroy();
  s.provider?.destroy();
  s.idb.destroy();
  s.doc.destroy();
  session = null;
  cursor = null;
  drag = null;
  collabBridge.active = false;
  useCollab.setState(OFF);
}

function syncToPlan(plan: Plan) {
  const want = keyFor(plan);
  if ((session?.key ?? null) === want) return;
  leave();
  if (want) join(plan);
}

let started = false;

/** Call once the app is ready: joins a room from the URL or the open plan, and follows plan switches. */
export function initCollab() {
  if (started) return;
  started = true;
  collabBridge.blocked = () => {
    if (!session) return null;
    if (!session.ready) return 'Still connecting to the live session…';
    if (useCollab.getState().role === 'view') return 'This is a view-only link. Ask for the edit link to make changes.';
    return null;
  };
  collabBridge.undo = () => {
    flushLocal();
    session?.undo?.undo();
  };
  collabBridge.redo = () => {
    flushLocal();
    session?.undo?.redo();
  };

  usePlan.subscribe((state, prev) => {
    if (state.plan !== prev.plan) {
      // Switching away from a live plan: its last edits go out before the session closes.
      if (session && prev.plan.id === session.planId && state.plan.id !== session.planId) flushLocal(prev.plan);
      syncToPlan(state.plan);
      scheduleFlush();
    }
    if (session && (state.stepIndex !== prev.stepIndex || state.selectedId !== prev.selectedId)) schedulePresence();
  });
  useProfile.subscribe(() => session && schedulePresence());

  const link = readRoomLink();
  if (link) {
    clearRoomLink();
    openRoomLink(link);
  } else {
    syncToPlan(usePlan.getState().plan);
  }
}

function openRoomLink(link: Omit<LiveLink, 'role'>) {
  const s = usePlan.getState();
  const existing = s.plan.live?.room === link.room ? s.plan : s.library.find((p) => p.live?.room === link.room);
  // Opening a view link must not downgrade a browser that already has edit access.
  const live: LiveLink =
    existing?.live?.role === 'edit' ? existing.live : { ...link, viewToken: link.viewToken ?? existing?.live?.viewToken };
  fallback = existing?.live && existing.live.token !== live.token ? { planId: existing.id, live: existing.live } : null;
  if (existing?.id === s.plan.id) s.setLive(live);
  else if (existing) s.loadPlan({ ...structuredClone(existing), live });
  else s.loadPlan({ ...makePlan(s.plan.mapId), live });
  s.showToast('Joining live session…');
}

// ---------- user actions ----------

async function uploadEmbeddedImages(plan: Plan, room: string, token: string) {
  const urls = new Map<string, string>();
  for (const step of plan.steps) {
    for (const el of step.elements) {
      if (el.kind !== 'image' || !el.src.startsWith('data:') || urls.has(el.src)) continue;
      urls.set(el.src, await uploadImage(room, token, await dataUrlToBlob(el.src)));
    }
  }
  return urls;
}

/** Turns the open strategy into a live session and returns once the room exists. */
export async function startLiveSession() {
  const planId = usePlan.getState().plan.id;
  const room = await createRoom();
  let plan = usePlan.getState().plan;
  if (plan.id !== planId || plan.live) return;
  // Embedded images would bloat every sync; the room keeps uploads instead.
  const urls = await uploadEmbeddedImages(plan, room.room, room.edit);
  plan = usePlan.getState().plan;
  if (plan.id !== planId || plan.live) return;
  const steps = urls.size
    ? plan.steps.map((st) => ({
        ...st,
        elements: st.elements.map((el) => (el.kind === 'image' && urls.has(el.src) ? { ...el, src: urls.get(el.src)! } : el)),
      }))
    : plan.steps;
  usePlan.getState().applyRemotePlan({ ...plan, steps, live: { room: room.room, token: room.edit, viewToken: room.view, role: 'edit' } });
}

/** Closes the session; the strategy stays in the Library and reopening it rejoins. */
export function leaveLiveSession() {
  const s = usePlan.getState();
  s.newPlan(s.plan.mapId);
}

/** Keeps the current state as a personal strategy that no longer syncs. */
export function forkLiveSession() {
  const s = usePlan.getState();
  flushLocal();
  const { live: _live, ...rest } = s.plan;
  s.loadPlan({ ...structuredClone(rest), id: makePlan(rest.mapId).id, title: `${rest.title} (copy)`, updatedAt: Date.now() });
}

export function liveRoomToken() {
  const live = usePlan.getState().plan.live;
  return live && useCollab.getState().role === 'edit' ? live : null;
}
