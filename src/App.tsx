import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import TopBar from './components/TopBar';
import AgentPalette from './components/AgentPalette';
import Inspector from './components/Inspector';
import Timeline from './components/Timeline';
import Toolbar from './components/Toolbar';
import Board from './components/board/Board';
import MapPicker from './components/MapPicker';
import Library from './components/Library';
import Toast from './components/Toast';
import TooltipLayer from './components/TooltipLayer';
import ShortcutsModal from './components/ShortcutsModal';
import LineupsPanel from './components/LineupsPanel';
import LiveModal from './components/LiveModal';
import { initCollab } from './collab/session';
import { addImageFiles, copyShareLink, exportPng, removePieces, startNewPlan } from './lib/actions';
import { pickImageFiles } from './lib/images';
import { useLineups } from './store/lineupStore';
import { togglePlayback } from './lib/playback';
import { DRAW_COLORS, STROKE_WIDTHS } from './lib/colors';
import { useGameData } from './store/gameData';
import { usePlan, type Rotation } from './store/planStore';
import { clearShareLink, fetchSharedPlan, readShareLink } from './lib/share';
import type { Plan } from './types';
import { boardApi } from './lib/boardApi';
import { normalizeAngle } from './lib/elements';
import type { Tool } from './types';

const TOOL_KEYS: Record<string, Tool> = { v: 'select', h: 'pan', p: 'pen', l: 'line', o: 'area', b: 'rect', g: 'polygon', t: 'text', e: 'eraser' };
const ROTATION_KEYS: Record<string, Rotation> = { '1': 0, '2': 90, '3': 180, '4': 270 };

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

export default function App() {
  const status = useGameData((s) => s.status);
  const error = useGameData((s) => s.error);
  const load = useGameData((s) => s.load);
  const [modal, setModal] = useState<'maps' | 'library' | 'help' | 'live' | null>(null);
  const modalRef = useRef(modal);
  modalRef.current = modal;
  const [drawer, setDrawer] = useState<'left' | 'right' | null>(null);
  const armed = usePlan((s) => s.armed);

  useEffect(() => {
    // On narrow screens the palette covers the map, so get out of the way once something is picked.
    if (armed) setDrawer((d) => (d === 'left' ? null : d));
  }, [armed]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (status !== 'ready') return;
    const { maps, mapsById } = useGameData.getState();
    const plans = usePlan.getState();
    const openShared = (shared: Plan | null): boolean => {
      clearShareLink();
      if (!shared) plans.showToast('That share link is broken or no longer exists');
      else if (!mapsById[shared.mapId]) plans.showToast('That share link points to a map that is no longer available');
      else {
        plans.loadPlan(shared);
        plans.showToast('Shared strategy loaded');
        return true;
      }
      return false;
    };
    const link = readShareLink();
    let loaded = false;
    if (link?.kind === 'hash') loaded = openShared(link.plan);
    else if (link?.kind === 'short') {
      // The link stays in the address bar on a network error so reloading tries again.
      fetchSharedPlan(link.id).then(openShared, () => plans.showToast("Couldn't reach the server to open that share link. Check your connection and reload."));
    }
    const plan = usePlan.getState().plan;
    if (!loaded && !mapsById[plan.mapId]) {
      const fallback = maps.find((m) => m.displayName === 'Ascent') ?? maps[0];
      if (fallback) usePlan.setState({ plan: { ...plan, mapId: fallback.uuid, steps: plan.steps } });
    }
    initCollab();
  }, [status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      // Modals handle their own Escape; everything else waits until they close.
      if (modalRef.current) return;
      const s = usePlan.getState();
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };

      if (mod) {
        // e.code keeps working when Alt/Option changes the produced character on macOS.
        if (e.code === 'KeyZ') run(() => (e.shiftKey ? s.redo() : s.undo()));
        else if (e.code === 'KeyY') run(s.redo);
        else if (e.code === 'KeyS' && e.shiftKey) run(copyShareLink);
        else if (e.code === 'KeyS') run(s.saveToLibrary);
        else if (e.code === 'KeyE' && e.shiftKey) run(exportPng);
        else if (e.code === 'KeyO') run(() => setModal('library'));
        else if (e.code === 'KeyN' && e.altKey) run(startNewPlan);
        else if (e.code === 'KeyD' && s.selectedId) run(() => s.duplicateElement(s.selectedId!));
        return;
      }
      if (e.altKey) return;
      if (e.key === 'Escape') {
        const lu = useLineups.getState();
        if (lu.picking) return lu.setPicking(null);
        s.setArmed(null);
        s.select(null);
        return;
      }
      if (e.key === '?') return run(() => setModal('help'));
      if (key === 'k') return run(togglePlayback);
      if (key === 'u' && !e.shiftKey) return run(() => useLineups.getState().setOpen(!useLineups.getState().open));
      if (s.playback) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) run(() => removePieces([s.selectedId!]));
      else if (e.key === 'ArrowLeft') run(() => s.setStepIndex(s.stepIndex - 1));
      else if (e.key === 'ArrowRight') run(() => s.setStepIndex(s.stepIndex + 1));
      else if (TOOL_KEYS[key] && !e.shiftKey) s.setTool(TOOL_KEYS[key]);
      else if (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}') {
        const el = s.plan.steps[s.stepIndex]?.elements.find((x) => x.id === s.selectedId);
        if (el?.kind === 'agent') {
          const delta = (e.key === '[' || e.key === '{' ? -1 : 1) * (e.shiftKey ? 5 : 15);
          s.updateElement(el.id, { facing: normalizeAngle((el.facing ?? 0) + delta), vision: el.vision ?? true }, `turn-${el.id}`);
        }
      } else if (key === 'a') s.setArrow(!s.arrow);
      else if (key === 'd') s.setDashed(!s.dashed);
      else if (key === 'c') {
        const i = DRAW_COLORS.indexOf(s.color);
        s.setColor(DRAW_COLORS[(i + (e.shiftKey ? -1 : 1) + DRAW_COLORS.length) % DRAW_COLORS.length]);
      } else if (key === 'w') {
        const i = STROKE_WIDTHS.indexOf(s.strokeWidth);
        s.setStrokeWidth(STROKE_WIDTHS[(i + 1) % STROKE_WIDTHS.length]);
      } else if (key === 'x') s.setTeam(s.team === 'ally' ? 'enemy' : 'ally');
      else if (key === 'n') s.addStep(e.shiftKey);
      else if (key === 'r') s.setSettings({ rotation: (((s.settings.rotation + (e.shiftKey ? 270 : 90)) % 360) as Rotation) });
      else if (ROTATION_KEYS[e.key] !== undefined) s.setSettings({ rotation: ROTATION_KEYS[e.key] });
      else if (key === 'f') boardApi.fit();
      else if (e.key === '=' || e.key === '+') boardApi.zoom(1.25);
      else if (e.key === '-' || e.key === '_') boardApi.zoom(1 / 1.25);
      else if (key === 'm') setModal('maps');
      else if (key === 'i') run(() => pickImageFiles(true).then(addImageFiles));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (status !== 'ready') {
    return (
      <div className="splash">
        <svg viewBox="0 0 32 32" width="56" height="56" aria-hidden>
          <path d="M3 6l11 20h5L8 6zM29 6l-8 15h-5l8-15z" fill="#ff4655" />
        </svg>
        {status === 'error' ? (
          <>
            <p>Couldn't reach valorant-api.com.</p>
            <p className="muted small">{error}</p>
            <button
              className="btn primary"
              onClick={() => {
                useGameData.setState({ status: 'idle' });
                load();
              }}
            >
              <RefreshCw size={15} /> Retry
            </button>
          </>
        ) : (
          <>
            <div className="splash-bar" />
            <p className="muted">Loading maps and agents…</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`app ${drawer ? `app--${drawer}-open` : ''}`}>
      <TopBar
        onOpenMaps={() => setModal('maps')}
        onOpenLibrary={() => setModal('library')}
        onOpenHelp={() => setModal('help')}
        onOpenLive={() => setModal('live')}
        onToggleDrawer={(side) => setDrawer((d) => (d === side ? null : side))}
      />
      <div className="drawer-backdrop" onClick={() => setDrawer(null)} />
      <AgentPalette />
      <main className="main">
        <Board />
        <Toolbar />
        <LineupsPanel />
      </main>
      <Timeline />
      <Inspector onOpenHelp={() => setModal('help')} />
      {modal === 'maps' && <MapPicker onClose={() => setModal(null)} />}
      {modal === 'library' && <Library onClose={() => setModal(null)} />}
      {modal === 'help' && <ShortcutsModal onClose={() => setModal(null)} />}
      {modal === 'live' && <LiveModal onClose={() => setModal(null)} />}
      <Toast />
      <TooltipLayer />
    </div>
  );
}
