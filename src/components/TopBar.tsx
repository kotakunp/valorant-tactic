import { CheckCircle2, ChevronDown, Download, FolderOpen, FilePlus2, Keyboard, PanelLeft, PanelRight, Redo2, Share2, Undo2 } from 'lucide-react';
import { usePlan } from '../store/planStore';
import { useGameData } from '../store/gameData';
import { tip, tipFor } from '../lib/shortcuts';
import { copyShareLink, exportPng, startNewPlan } from '../lib/actions';

interface Props {
  onOpenMaps: () => void;
  onOpenLibrary: () => void;
  onOpenHelp: () => void;
  onToggleDrawer: (side: 'left' | 'right') => void;
}

export default function TopBar({ onOpenMaps, onOpenLibrary, onOpenHelp, onToggleDrawer }: Props) {
  const plan = usePlan((s) => s.plan);
  const canUndo = usePlan((s) => s.past.length > 0);
  const canRedo = usePlan((s) => s.future.length > 0);
  const map = useGameData((s) => s.mapsById[plan.mapId]);
  const a = usePlan.getState();

  return (
    <header className="topbar">
      <button className="icon-btn narrow-only" onClick={() => onToggleDrawer('left')} {...tip('Agents & abilities')}>
        <PanelLeft size={18} />
      </button>
      <div className="brand">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
          <path d="M3 6l11 20h5L8 6zM29 6l-8 15h-5l8-15z" fill="#ff4655" />
        </svg>
        <span className="brand-name">
          VALO<span className="brand-slash">//</span>TACTIC
        </span>
      </div>

      <button className="map-switch" onClick={onOpenMaps} {...tipFor('maps')}>
        {map && <img src={map.listViewIcon} alt="" />}
        <span className="map-switch-text">
          <small>Map</small>
          <strong>{map?.displayName ?? 'Select map'}</strong>
        </span>
        <ChevronDown size={16} />
      </button>

      <input
        className="plan-title"
        value={plan.title}
        onChange={(e) => a.setTitle(e.target.value)}
        aria-label="Strategy title"
        spellCheck={false}
      />

      <div className="segmented" role="radiogroup" aria-label="Side">
        <button role="radio" aria-checked={plan.side === 'attack'} className={plan.side === 'attack' ? 'on attack' : ''} onClick={() => a.setSide('attack')}>
          Attack
        </button>
        <button role="radio" aria-checked={plan.side === 'defense'} className={plan.side === 'defense' ? 'on defense' : ''} onClick={() => a.setSide('defense')}>
          Defense
        </button>
      </div>

      <div className="topbar-spacer" />

      <span
        className="save-status"
        tabIndex={0}
        {...tip('Autosaved in this browser and listed in your Library. Use Share or a Library file export to move it to another device.')}
      >
        <CheckCircle2 size={14} /> Saved
      </span>

      <div className="topbar-group">
        <button className="icon-btn" disabled={!canUndo} onClick={a.undo} {...tipFor('undo')}>
          <Undo2 size={17} />
        </button>
        <button className="icon-btn" disabled={!canRedo} onClick={a.redo} {...tipFor('redo')}>
          <Redo2 size={17} />
        </button>
      </div>

      <div className="topbar-group">
        <button className="btn ghost" onClick={startNewPlan} {...tipFor('newPlan')}>
          <FilePlus2 size={16} /> New
        </button>
        <button className="btn ghost" onClick={onOpenLibrary} {...tipFor('library', 'bottom', 'Library: all your strategies')}>
          <FolderOpen size={16} /> Library
        </button>
        <button className="btn ghost" onClick={exportPng} {...tipFor('exportPng', 'bottom', 'Export current step as PNG')}>
          <Download size={16} /> PNG
        </button>
        <button className="btn primary" onClick={copyShareLink} {...tipFor('share')}>
          <Share2 size={16} /> Share
        </button>
        <button className="icon-btn" onClick={onOpenHelp} {...tipFor('help')}>
          <Keyboard size={17} />
        </button>
      </div>
      <button className="icon-btn narrow-only" onClick={() => onToggleDrawer('right')} {...tip('Details & selection')}>
        <PanelRight size={18} />
      </button>
    </header>
  );
}
