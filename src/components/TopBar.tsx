import { CheckCircle2, ChevronDown, CloudOff, Crosshair, Download, FolderOpen, FilePlus2, Keyboard, PanelLeft, PanelRight, Redo2, RefreshCw, Share2, Undo2 } from 'lucide-react';
import { useCollab } from '../collab/session';
import { useLineups } from '../store/lineupStore';
import { usePlan } from '../store/planStore';
import { useGameData } from '../store/gameData';
import { tip, tipFor } from '../lib/shortcuts';
import { copyShareLink, exportPng, startNewPlan } from '../lib/actions';

interface Props {
  onOpenMaps: () => void;
  onOpenLibrary: () => void;
  onOpenHelp: () => void;
  onOpenLive: () => void;
  onToggleDrawer: (side: 'left' | 'right') => void;
}

function LiveButton({ onClick }: { onClick: () => void }) {
  const active = useCollab((s) => s.active);
  const status = useCollab((s) => s.status);
  const ready = useCollab((s) => s.ready);
  const peers = useCollab((s) => s.peers);
  const shown = peers.slice(0, 3);
  return (
    <button
      className={`btn ghost live-btn ${active ? 'on' : ''}`}
      onClick={onClick}
      {...tip(active ? `Live session: ${peers.length + 1} here. Invite links and people.` : 'Plan together in real time')}
    >
      <span className={`live-dot ${active ? (ready ? status : 'connecting') : 'off'}`} /> Live
      {shown.length > 0 && (
        <span className="live-avatars" aria-hidden>
          {shown.map((p) => (
            <i key={p.id} style={{ background: p.color }}>
              {p.name.trim().charAt(0).toUpperCase()}
            </i>
          ))}
          {peers.length > shown.length && <i className="more">+{peers.length - shown.length}</i>}
        </span>
      )}
    </button>
  );
}

function SaveStatus() {
  const active = useCollab((s) => s.active);
  const status = useCollab((s) => s.status);
  const ready = useCollab((s) => s.ready);
  const unsynced = useCollab((s) => s.unsynced);
  if (!active) {
    return (
      <span
        className="save-status"
        tabIndex={0}
        {...tip('Autosaved in this browser and listed in your Library. Use Share or a Library file export to move it to another device.')}
      >
        <CheckCircle2 size={14} /> Saved
      </span>
    );
  }
  if (ready && status === 'offline') {
    return (
      <span className="save-status offline" tabIndex={0} {...tip('Offline. Your edits are kept in this browser and sync when the connection is back.')}>
        <CloudOff size={14} /> Offline
      </span>
    );
  }
  if (!ready || unsynced || status !== 'connected') {
    return (
      <span className="save-status syncing" tabIndex={0} {...tip('Sending changes to the live session')}>
        <RefreshCw size={13} /> {ready ? 'Syncing' : 'Connecting'}
      </span>
    );
  }
  return (
    <span className="save-status" tabIndex={0} {...tip('Every change is synced to everyone in the live session')}>
      <CheckCircle2 size={14} /> Synced
    </span>
  );
}

export default function TopBar({ onOpenMaps, onOpenLibrary, onOpenHelp, onOpenLive, onToggleDrawer }: Props) {
  const plan = usePlan((s) => s.plan);
  const live = useCollab((s) => s.active);
  const liveUndo = useCollab((s) => s.canUndo);
  const liveRedo = useCollab((s) => s.canRedo);
  const localUndo = usePlan((s) => s.past.length > 0);
  const localRedo = usePlan((s) => s.future.length > 0);
  const canUndo = live ? liveUndo : localUndo;
  const canRedo = live ? liveRedo : localRedo;
  const map = useGameData((s) => s.mapsById[plan.mapId]);
  const lineupsOpen = useLineups((s) => s.open);
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

      <SaveStatus />
      <div className="topbar-group">
        <button className="icon-btn" disabled={!canUndo} onClick={a.undo} {...tipFor('undo')}>
          <Undo2 size={17} />
        </button>
        <button className="icon-btn" disabled={!canRedo} onClick={a.redo} {...tipFor('redo')}>
          <Redo2 size={17} />
        </button>
      </div>

      <div className="topbar-group">
        <button className="btn ghost compact" onClick={startNewPlan} {...tipFor('newPlan')}>
          <FilePlus2 size={16} /> New
        </button>
        <button className="btn ghost" onClick={onOpenLibrary} {...tipFor('library', 'bottom', 'Library: all your strategies')}>
          <FolderOpen size={16} /> Library
        </button>
        <button
          className={`btn ghost ${lineupsOpen ? 'on' : ''}`}
          aria-pressed={lineupsOpen}
          onClick={() => useLineups.getState().setOpen(!lineupsOpen)}
          {...tipFor('lineups', 'bottom', 'Lineups for this map')}
        >
          <Crosshair size={16} /> Lineups
        </button>
        <button className="btn ghost compact" onClick={exportPng} {...tipFor('exportPng', 'bottom', 'Export current step as PNG')}>
          <Download size={16} /> PNG
        </button>
        <LiveButton onClick={onOpenLive} />
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
