import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AbilitySlot, Lineup, Point, Side } from '../types';
import { uid } from '../lib/ids';
import { safeJSONStorage } from '../lib/safeStorage';

export interface LineupDraft {
  id?: string;
  mapId: string;
  agentId: string;
  slot: AbilitySlot;
  side: Side | 'both';
  title: string;
  notes: string;
  stand: Point | null;
  land: Point | null;
  images: string[];
  videoUrl: string;
}

export type PickTarget = 'stand' | 'land';

export interface LineupFilter {
  agentId: string | null;
  side: Side | 'all';
  query: string;
}
export const MAX_LINEUP_IMAGES = 3;

interface LineupState {
  lineups: Lineup[];
  /** UI state below is not persisted. */
  open: boolean;
  activeId: string | null;
  draft: LineupDraft | null;
  picking: PickTarget | null;
  filter: LineupFilter;

  setFilter: (patch: Partial<LineupFilter>) => void;
  setOpen: (open: boolean) => void;
  setActive: (id: string | null) => void;
  startDraft: (draft: LineupDraft, picking?: PickTarget | null) => void;
  editLineup: (id: string) => void;
  updateDraft: (patch: Partial<LineupDraft>) => void;
  setPicking: (target: PickTarget | null) => void;
  pickPoint: (p: Point) => void;
  /** Returns an error message, or null once saved. */
  saveDraft: () => string | null;
  cancelDraft: () => void;
  removeLineup: (id: string) => void;
  importLineups: (items: Lineup[]) => number;
}

export const useLineups = create<LineupState>()(
  persist(
    (set, get) => ({
      lineups: [],
      open: false,
      activeId: null,
      draft: null,
      picking: null,
      filter: { agentId: null, side: 'all', query: '' },

      setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),
      setOpen: (open) => set(open ? { open } : { open, picking: null }),
      setActive: (activeId) => set({ activeId }),
      startDraft: (draft, picking = null) => set({ open: true, draft, picking }),
      editLineup: (id) => {
        const l = get().lineups.find((x) => x.id === id);
        if (!l) return;
        set({ draft: { ...l, videoUrl: l.videoUrl ?? '', images: [...l.images] }, picking: null, activeId: id });
      },
      updateDraft: (patch) => {
        const d = get().draft;
        if (d) set({ draft: { ...d, ...patch } });
      },
      setPicking: (picking) => set({ picking }),
      pickPoint: (p) => {
        const { draft, picking } = get();
        if (!draft || !picking) return;
        const next = { ...draft, [picking]: { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 } };
        // Placing the stand spot first is the natural order, so carry straight on to the landing spot.
        set({ draft: next, picking: picking === 'stand' && !next.land ? 'land' : null });
      },
      saveDraft: () => {
        const d = get().draft;
        if (!d) return 'Nothing to save';
        if (!d.stand || !d.land) return 'Pick both the stand spot and the landing spot on the map';
        const now = Date.now();
        const existing = d.id ? get().lineups.find((l) => l.id === d.id) : undefined;
        const lineup: Lineup = {
          id: existing?.id ?? uid(),
          mapId: d.mapId,
          agentId: d.agentId,
          slot: d.slot,
          side: d.side,
          title: d.title.trim(),
          notes: d.notes.trim(),
          stand: d.stand,
          land: d.land,
          images: d.images.slice(0, MAX_LINEUP_IMAGES),
          videoUrl: d.videoUrl.trim() || undefined,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        set({
          lineups: existing ? get().lineups.map((l) => (l.id === lineup.id ? lineup : l)) : [lineup, ...get().lineups],
          draft: null,
          picking: null,
          activeId: lineup.id,
        });
        return null;
      },
      cancelDraft: () => set({ draft: null, picking: null }),
      removeLineup: (id) => set({ lineups: get().lineups.filter((l) => l.id !== id), activeId: get().activeId === id ? null : get().activeId }),
      importLineups: (items) => {
        const byId = new Map(get().lineups.map((l) => [l.id, l]));
        let added = 0;
        for (const l of items) {
          const mine = byId.get(l.id);
          if (!mine || l.updatedAt > mine.updatedAt) {
            byId.set(l.id, l);
            added++;
          }
        }
        set({ lineups: [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt) });
        return added;
      },
    }),
    {
      name: 'valo-tactic:lineups',
      version: 1,
      storage: safeJSONStorage(),
      partialize: (s) => ({ lineups: s.lineups }),
    },
  ),
);

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'valo-tactic:lineups' || !e.newValue) return;
    try {
      const incoming = JSON.parse(e.newValue)?.state?.lineups;
      if (Array.isArray(incoming)) useLineups.setState({ lineups: incoming });
    } catch {
      /* ignore malformed writes from other tabs */
    }
  });
}
