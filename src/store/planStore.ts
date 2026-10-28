import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BoardEl, PalettePayload, Plan, Side, Step, Team, Tool } from '../types';
import { uid } from '../lib/ids';
import { createFromPayload } from '../lib/elements';
import { keepAgentsOnFloor } from '../lib/floor';
import { onStorageFull, safeJSONStorage } from '../lib/safeStorage';

export type Rotation = 0 | 90 | 180 | 270;

export interface Settings {
  showCallouts: boolean;
  showRanges: boolean;
  onionSkin: boolean;
  rotation: Rotation;
  iconScale: number;
  showVision: boolean;
  lineOfSight: boolean;
  showSightLines: boolean;
  showCrosshair: boolean;
  /** Boxes and half walls drawn on the minimap stop sight. */
  coverBlocksVision: boolean;
}

export interface Playback {
  from: number;
  to: number;
  t: number;
}

interface PlanState {
  plan: Plan;
  stepIndex: number;
  selectedId: string | null;
  tool: Tool;
  team: Team;
  color: string;
  strokeWidth: number;
  arrow: boolean;
  dashed: boolean;
  armed: PalettePayload | null;
  focusAgentId: string | null;
  settings: Settings;
  library: Plan[];
  /** Folders the user created; folders in use by plans are listed even when absent here. */
  folders: string[];
  past: Plan[];
  future: Plan[];
  playback: Playback | null;
  toast: { id: number; message: string } | null;

  setTool: (tool: Tool) => void;
  setTeam: (team: Team) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (w: number) => void;
  setArrow: (v: boolean) => void;
  setDashed: (v: boolean) => void;
  setArmed: (p: PalettePayload | null) => void;
  setFocusAgent: (id: string | null) => void;
  setSettings: (patch: Partial<Settings>) => void;
  select: (id: string | null) => void;

  addElement: (el: BoardEl) => void;
  addElements: (els: BoardEl[]) => void;
  placePayload: (payload: PalettePayload, pos: { x: number; y: number }) => void;
  updateElement: (id: string, patch: Partial<BoardEl>, coalesceKey?: string) => void;
  removeElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  clearStep: () => void;

  setMap: (mapId: string) => void;
  setSide: (side: Side) => void;
  setTitle: (title: string) => void;

  setStepIndex: (i: number) => void;
  addStep: (blank?: boolean) => void;
  removeStep: (i: number) => void;
  renameStep: (i: number, name: string) => void;
  setStepNotes: (notes: string) => void;

  undo: () => void;
  redo: () => void;

  newPlan: (mapId: string) => void;
  loadPlan: (plan: Plan) => void;
  saveToLibrary: () => void;
  deleteFromLibrary: (id: string) => void;
  updateLibraryPlan: (id: string, patch: Partial<Pick<Plan, 'folder' | 'tags'>>) => void;
  createFolder: (name: string) => void;
  renameFolder: (from: string, to: string) => void;
  deleteFolder: (name: string) => void;

  setPlayback: (p: Playback | null) => void;
  showToast: (message: string) => void;
}

function blankStep(n: number): Step {
  return { id: uid(), name: `Step ${n}`, notes: '', elements: [] };
}

export function makePlan(mapId: string): Plan {
  return { id: uid(), title: DEFAULT_TITLE, mapId, side: 'attack', steps: [blankStep(1)], updatedAt: Date.now() };
}

const DEFAULT_TITLE = 'Untitled strategy';

function hasContent(plan: Plan) {
  return plan.title !== DEFAULT_TITLE || plan.steps.length > 1 || plan.steps.some((s) => s.elements.length > 0 || s.notes.trim());
}

/** The library doubles as autosave: every strategy with content lives there, newest first. */
function upsertLibrary(library: Plan[], plan: Plan) {
  const exists = library.some((p) => p.id === plan.id);
  if (!exists && !hasContent(plan)) return library;
  return [plan, ...library.filter((p) => p.id !== plan.id)];
}

const STORAGE_KEY = 'valo-tactic:planner';

/** Folder and tags are library metadata, so undoing a board edit must not roll them back. */
function keepMeta(target: Plan, current: Plan): Plan {
  return { ...target, folder: current.folder, tags: current.tags };
}

let lastCommitKey: string | null = null;
let lastCommitAt = 0;

export const usePlan = create<PlanState>()(
  persist(
    (set, get) => {
      /** Every plan mutation goes through here so undo/redo stays consistent. */
      const commit = (next: Plan, coalesceKey?: string, extra: Partial<PlanState> = {}) => {
        const now = Date.now();
        const coalesce = !!coalesceKey && coalesceKey === lastCommitKey && now - lastCommitAt < 1200;
        lastCommitKey = coalesceKey ?? null;
        lastCommitAt = now;
        set((s) => {
          const plan = { ...next, updatedAt: now };
          return {
            plan,
            past: coalesce ? s.past : [...s.past.slice(-99), s.plan],
            future: [],
            library: upsertLibrary(s.library, plan),
            ...extra,
          };
        });
      };

      const mutateElements = (fn: (els: BoardEl[]) => BoardEl[], coalesceKey?: string, extra?: Partial<PlanState>) => {
        const { plan, stepIndex } = get();
        const steps = plan.steps.map((st, i) =>
          i === stepIndex ? { ...st, elements: keepAgentsOnFloor(plan.mapId, st.elements, fn(st.elements)) } : st,
        );
        commit({ ...plan, steps }, coalesceKey, extra);
      };

      return {
        plan: makePlan(''),
        stepIndex: 0,
        selectedId: null,
        tool: 'select',
        team: 'ally',
        color: '#ff4655',
        strokeWidth: 4,
        arrow: true,
        dashed: false,
        armed: null,
        focusAgentId: null,
        settings: {
          showCallouts: true,
          showRanges: true,
          onionSkin: true,
          rotation: 0,
          iconScale: 1,
          showVision: true,
          lineOfSight: true,
          showSightLines: true,
          showCrosshair: true,
          coverBlocksVision: true,
        },
        library: [],
        folders: [],
        past: [],
        future: [],
        playback: null,
        toast: null,

        setTool: (tool) => set({ tool, armed: null, selectedId: tool === 'select' ? get().selectedId : null }),
        setTeam: (team) => set({ team }),
        setColor: (color) => set({ color }),
        setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
        setArrow: (arrow) => set({ arrow }),
        setDashed: (dashed) => set({ dashed }),
        setArmed: (armed) => set({ armed, tool: armed ? 'select' : get().tool }),
        setFocusAgent: (focusAgentId) => set({ focusAgentId }),
        setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        select: (selectedId) => set({ selectedId }),

        addElement: (el) => mutateElements((els) => [...els, el], undefined, { selectedId: el.id }),
        addElements: (added) => mutateElements((els) => [...els, ...added], undefined, { selectedId: added[added.length - 1]?.id ?? null }),
        placePayload: (payload, pos) => {
          const el = createFromPayload(payload, pos, get().team);
          if (el) get().addElement(el);
        },
        updateElement: (id, patch, coalesceKey) =>
          mutateElements(
            (els) => els.map((el) => (el.id === id ? ({ ...el, ...patch } as BoardEl) : el)),
            coalesceKey,
          ),
        removeElement: (id) =>
          mutateElements((els) => els.filter((el) => el.id !== id), undefined, {
            selectedId: get().selectedId === id ? null : get().selectedId,
          }),
        duplicateElement: (id) => {
          const src = get().plan.steps[get().stepIndex]?.elements.find((e) => e.id === id);
          if (!src) return;
          const copy: BoardEl =
            'points' in src
              ? ({ ...src, id: uid(), points: src.points.map((p) => p + 20) } as BoardEl)
              : ({ ...src, id: uid(), x: src.x + 20, y: src.y + 20 } as BoardEl);
          get().addElement(copy);
        },
        clearStep: () => mutateElements(() => [], undefined, { selectedId: null }),

        setMap: (mapId) => {
          const { plan } = get();
          if (plan.mapId === mapId) return;
          commit({ ...plan, mapId, steps: [blankStep(1)] }, undefined, { stepIndex: 0, selectedId: null });
        },
        setSide: (side) => commit({ ...get().plan, side }),
        setTitle: (title) => commit({ ...get().plan, title }, 'title'),

        setStepIndex: (i) => {
          const n = get().plan.steps.length;
          set({ stepIndex: Math.max(0, Math.min(n - 1, i)), selectedId: null });
        },
        addStep: (blank) => {
          const { plan, stepIndex } = get();
          const current = plan.steps[stepIndex];
          // Duplicated steps keep element ids so playback can tween each piece to its new spot.
          const step: Step = blank
            ? blankStep(plan.steps.length + 1)
            : {
                id: uid(),
                name: `Step ${plan.steps.length + 1}`,
                notes: '',
                // A route describes how an agent got to this step, so the copy starts without one.
                elements: current.elements.map((e) => (e.kind === 'agent' ? { ...e, via: undefined } : { ...e })),
              };
          const steps = [...plan.steps.slice(0, stepIndex + 1), step, ...plan.steps.slice(stepIndex + 1)];
          commit({ ...plan, steps }, undefined, { stepIndex: stepIndex + 1, selectedId: null });
        },
        removeStep: (i) => {
          const { plan, stepIndex } = get();
          if (plan.steps.length <= 1) return;
          const steps = plan.steps.filter((_, idx) => idx !== i);
          commit({ ...plan, steps }, undefined, {
            stepIndex: Math.min(stepIndex >= i ? Math.max(0, stepIndex - 1) : stepIndex, steps.length - 1),
            selectedId: null,
          });
        },
        renameStep: (i, name) => {
          const { plan } = get();
          commit({ ...plan, steps: plan.steps.map((st, idx) => (idx === i ? { ...st, name } : st)) }, `rename-${i}`);
        },
        setStepNotes: (notes) => {
          const { plan, stepIndex } = get();
          commit(
            { ...plan, steps: plan.steps.map((st, idx) => (idx === stepIndex ? { ...st, notes } : st)) },
            `notes-${stepIndex}`,
          );
        },

        undo: () => {
          const { past, plan, future, stepIndex } = get();
          if (!past.length) return;
          const prev = keepMeta(past[past.length - 1], plan);
          lastCommitKey = null;
          set({
            plan: prev,
            library: upsertLibrary(get().library, prev),
            past: past.slice(0, -1),
            future: [plan, ...future],
            stepIndex: Math.min(stepIndex, prev.steps.length - 1),
            selectedId: null,
          });
        },
        redo: () => {
          const { past, plan, future, stepIndex } = get();
          if (!future.length) return;
          const next = keepMeta(future[0], plan);
          lastCommitKey = null;
          set({
            plan: next,
            library: upsertLibrary(get().library, next),
            past: [...past, plan],
            future: future.slice(1),
            stepIndex: Math.min(stepIndex, next.steps.length - 1),
            selectedId: null,
          });
        },

        newPlan: (mapId) => set({ plan: makePlan(mapId), stepIndex: 0, past: [], future: [], selectedId: null }),
        loadPlan: (plan) =>
          set({ plan, library: upsertLibrary(get().library, plan), stepIndex: 0, past: [], future: [], selectedId: null, playback: null }),
        saveToLibrary: () => {
          set({ library: upsertLibrary(get().library, get().plan) });
          get().showToast('All changes are saved automatically in this browser');
        },
        deleteFromLibrary: (id) => {
          const { plan, library } = get();
          set({ library: library.filter((p) => p.id !== id) });
          // Otherwise the next edit would autosave the deleted strategy straight back in.
          if (plan.id === id) set({ plan: makePlan(plan.mapId), stepIndex: 0, past: [], future: [], selectedId: null });
        },
        updateLibraryPlan: (id, patch) => {
          const { plan, library } = get();
          const target = id === plan.id ? plan : library.find((p) => p.id === id);
          if (!target) return;
          const next = { ...target, ...patch, updatedAt: Date.now() };
          set({
            library: library.some((p) => p.id === id) ? library.map((p) => (p.id === id ? next : p)) : upsertLibrary(library, next),
            ...(id === plan.id ? { plan: next } : {}),
          });
        },
        createFolder: (name) => {
          const n = name.trim();
          if (n && !get().folders.includes(n)) set({ folders: [...get().folders, n] });
        },
        renameFolder: (from, to) => {
          const n = to.trim();
          if (!n || n === from) return;
          const { plan, library, folders } = get();
          const move = (p: Plan) => (p.folder === from ? { ...p, folder: n, updatedAt: Date.now() } : p);
          set({
            folders: [...new Set(folders.map((f) => (f === from ? n : f)))],
            library: library.map(move),
            plan: move(plan),
          });
        },
        deleteFolder: (name) => {
          const { plan, library, folders } = get();
          const unfile = (p: Plan) => (p.folder === name ? { ...p, folder: undefined, updatedAt: Date.now() } : p);
          set({ folders: folders.filter((f) => f !== name), library: library.map(unfile), plan: unfile(plan) });
        },

        setPlayback: (playback) => set({ playback }),
        showToast: (message) => set({ toast: { id: Date.now(), message } }),
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      storage: safeJSONStorage(),
      // Shallow merge would drop settings added after a user's state was first saved.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PlanState>;
        return { ...current, ...p, settings: { ...current.settings, ...p.settings } };
      },
      partialize: (s) => ({
        plan: s.plan,
        stepIndex: s.stepIndex,
        settings: s.settings,
        library: s.library,
        folders: s.folders,
        team: s.team,
        color: s.color,
        strokeWidth: s.strokeWidth,
        arrow: s.arrow,
        dashed: s.dashed,
      }),
    },
  ),
);

const librarySignature = (library: Plan[]) => library.map((p) => `${p.id}:${p.updatedAt}`).join('|');

// Every tab persists its whole library, so without this a second open tab would overwrite
// strategies saved in the first. The other tab's list wins, except for the plan open here.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    let incoming: Plan[] | undefined;
    let incomingFolders: string[] | undefined;
    try {
      const state = JSON.parse(e.newValue)?.state;
      incoming = state?.library;
      incomingFolders = state?.folders;
    } catch {
      return;
    }
    if (Array.isArray(incomingFolders)) {
      const { folders } = usePlan.getState();
      if (incomingFolders.join('|') !== folders.join('|')) usePlan.setState({ folders: incomingFolders });
    }
    if (!Array.isArray(incoming)) return;
    const { plan, library } = usePlan.getState();
    const theirs = incoming.find((p) => p.id === plan.id);
    const merged = theirs && theirs.updatedAt >= plan.updatedAt ? incoming : upsertLibrary(incoming, plan);
    merged.sort((a, b) => b.updatedAt - a.updatedAt);
    if (librarySignature(merged) !== librarySignature(library)) usePlan.setState({ library: merged });
  });
}

onStorageFull((message) => usePlan.getState().showToast(message));

export function useCurrentStep() {
  return usePlan((s) => s.plan.steps[s.stepIndex] ?? s.plan.steps[0]);
}
