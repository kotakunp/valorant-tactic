import { useMemo, useRef, useState } from 'react';
import { Crosshair, ExternalLink, FileDown, FileUp, ImagePlus, MapPin, Pencil, Plus, Search, Target, Trash2, X } from 'lucide-react';
import { useLineups, MAX_LINEUP_IMAGES, type LineupDraft } from '../store/lineupStore';
import { usePlan } from '../store/planStore';
import { useGameData } from '../store/gameData';
import { downloadLineups, filterLineups, lineupTitle, nearestCallout, placeLineup, readLineupsFile } from '../lib/lineups';
import { addLineupImages } from '../lib/actions';
import { pickImageFiles } from '../lib/images';
import { SLOT_KEYS } from '../lib/abilityPresets';
import { tip, tipFor } from '../lib/shortcuts';
import type { AbilitySlot, Lineup, Side } from '../types';

const SLOTS: AbilitySlot[] = ['Grenade', 'Ability1', 'Ability2', 'Ultimate'];
const SIDE_LABEL: Record<Side | 'both', string> = { both: 'Both', attack: 'Attack', defense: 'Defense' };

function safeVideoUrl(url: string | undefined) {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export default function LineupsPanel() {
  const open = useLineups((s) => s.open);
  const draft = useLineups((s) => s.draft);
  const picking = useLineups((s) => s.picking);
  const [zoomed, setZoomed] = useState<string | null>(null);
  if (!open) return null;

  return (
    <aside className={`lineups ${picking ? 'lineups--picking' : ''}`} aria-label="Lineups">
      {draft ? <LineupForm draft={draft} onZoom={setZoomed} /> : <LineupList onZoom={setZoomed} />}
      {zoomed && (
        <div className="lightbox" onClick={() => setZoomed(null)} role="dialog" aria-label="Image preview">
          <img src={zoomed} alt="" />
        </div>
      )}
    </aside>
  );
}

function LineupList({ onZoom }: { onZoom: (src: string) => void }) {
  const lineups = useLineups((s) => s.lineups);
  const filter = useLineups((s) => s.filter);
  const activeId = useLineups((s) => s.activeId);
  const plan = usePlan((s) => s.plan);
  const selectedAgentId = usePlan((s) => {
    const el = s.plan.steps[s.stepIndex]?.elements.find((e) => e.id === s.selectedId);
    return el && (el.kind === 'agent' || el.kind === 'ability') ? el.agentId : null;
  });
  const agents = useGameData((s) => s.agents);
  const map = useGameData((s) => s.mapsById[plan.mapId]);
  const lu = useLineups.getState();
  const fileRef = useRef<HTMLInputElement>(null);

  const onMap = useMemo(() => lineups.filter((l) => l.mapId === plan.mapId), [lineups, plan.mapId]);
  const shown = useMemo(() => filterLineups(lineups, plan.mapId, filter), [lineups, plan.mapId, filter]);
  const agentOptions = useMemo(() => {
    const used = new Set(onMap.map((l) => l.agentId));
    return agents.filter((a) => used.has(a.uuid) || a.uuid === filter.agentId);
  }, [agents, onMap, filter.agentId]);

  const startNew = () => {
    const agentId = filter.agentId ?? selectedAgentId ?? agents[0]?.uuid;
    if (!agentId) return;
    const draft: LineupDraft = {
      mapId: plan.mapId,
      agentId,
      slot: 'Grenade',
      side: plan.side,
      title: '',
      notes: '',
      stand: null,
      land: null,
      images: [],
      videoUrl: '',
    };
    lu.startDraft(draft, 'stand');
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const toast = usePlan.getState().showToast;
    try {
      const items = await readLineupsFile(file);
      const n = lu.importLineups(items);
      toast(n ? `Imported ${n} lineup${n === 1 ? '' : 's'}` : 'Those lineups are already in your library');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not import that file');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <div className="lineups-head">
        <div>
          <h2>Lineups</h2>
          <span className="muted small">
            {map?.displayName ?? 'This map'} · {onMap.length} saved
          </span>
        </div>
        <div className="panel-actions">
          <button className="icon-btn" onClick={() => fileRef.current?.click()} {...tip('Import lineups file', null, 'left')}>
            <FileUp size={15} />
          </button>
          <button
            className="icon-btn"
            disabled={!onMap.length}
            onClick={() => downloadLineups(onMap, `${map?.displayName ?? 'map'} lineups`)}
            {...tip('Export this map’s lineups', null, 'left')}
          >
            <FileDown size={15} />
          </button>
          <button className="icon-btn" onClick={() => lu.setOpen(false)} {...tipFor('lineups', 'left', 'Close lineups')}>
            <X size={16} />
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
      </div>

      <div className="lineups-body">
        <button className="btn primary full-width" onClick={startNew}>
          <Plus size={15} /> New lineup
        </button>

        {onMap.length > 0 && (
          <div className="lineups-filters">
            <label className="search">
              <Search size={14} />
              <input value={filter.query} placeholder="Search lineups" onChange={(e) => lu.setFilter({ query: e.target.value })} />
            </label>
            <select className="input" value={filter.agentId ?? ''} onChange={(e) => lu.setFilter({ agentId: e.target.value || null })} aria-label="Agent">
              <option value="">All agents</option>
              {agentOptions.map((a) => (
                <option key={a.uuid} value={a.uuid}>
                  {a.displayName}
                </option>
              ))}
            </select>
            <div className="segmented full small">
              {(['all', 'attack', 'defense'] as const).map((side) => (
                <button key={side} className={filter.side === side ? 'on' : ''} onClick={() => lu.setFilter({ side })}>
                  {side === 'all' ? 'Any side' : SIDE_LABEL[side]}
                </button>
              ))}
            </div>
          </div>
        )}

        {onMap.length === 0 ? (
          <p className="muted small">
            Save where to stand and where your utility lands, with screenshots and a video link. Lineups are kept per map in this
            browser and show up on the board while this panel is open.
          </p>
        ) : shown.length === 0 ? (
          <p className="muted small">No lineups match these filters.</p>
        ) : (
          <ul className="lineup-list">
            {shown.map((l) => (
              <LineupItem key={l.id} lineup={l} active={l.id === activeId} onZoom={onZoom} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function LineupItem({ lineup: l, active, onZoom }: { lineup: Lineup; active: boolean; onZoom: (src: string) => void }) {
  const agent = useGameData((s) => s.agentsById[l.agentId]);
  const map = useGameData((s) => s.mapsById[l.mapId]);
  const ability = agent?.abilities.find((a) => a.slot === l.slot);
  const lu = useLineups.getState();
  const video = safeVideoUrl(l.videoUrl);
  const from = nearestCallout(map, l.stand);

  return (
    <li className={`lineup ${active ? 'on' : ''}`}>
      <button className="lineup-row" onClick={() => lu.setActive(active ? null : l.id)} aria-expanded={active}>
        <span className="lineup-icons">
          {agent && <img src={agent.displayIconSmall} alt="" />}
          {ability && <img className="lineup-ability" src={ability.displayIcon} alt="" />}
        </span>
        <span className="lineup-text">
          <strong>{lineupTitle(l)}</strong>
          <small>
            {agent?.displayName ?? 'Agent'} · {SLOT_KEYS[l.slot]} {ability?.displayName} · {SIDE_LABEL[l.side]}
          </small>
        </span>
      </button>
      {active && (
        <div className="lineup-detail">
          {from && (
            <p className="small lineup-from">
              <MapPin size={12} /> Stand at {from}
            </p>
          )}
          {l.images.length > 0 && (
            <div className="lineup-images">
              {l.images.map((src, i) => (
                <button key={i} onClick={() => onZoom(src)} {...tip('View larger')}>
                  <img src={src} alt={`Lineup screenshot ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
          {l.notes && <p className="small lineup-notes">{l.notes}</p>}
          {video && (
            <a className="small lineup-video" href={video} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={12} /> Watch video
            </a>
          )}
          <div className="lineup-actions">
            <button className="btn ghost" onClick={() => placeLineup(l)} {...tip('Add the agent and utility to the current step')}>
              <Target size={14} /> Place
            </button>
            <button className="icon-btn" onClick={() => lu.editLineup(l.id)} {...tip('Edit')}>
              <Pencil size={15} />
            </button>
            <button
              className="icon-btn danger"
              onClick={() => {
                if (window.confirm(`Delete "${lineupTitle(l)}"?`)) lu.removeLineup(l.id);
              }}
              {...tip('Delete')}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function LineupForm({ draft, onZoom }: { draft: LineupDraft; onZoom: (src: string) => void }) {
  const agents = useGameData((s) => s.agents);
  const map = useGameData((s) => s.mapsById[draft.mapId]);
  const picking = useLineups((s) => s.picking);
  const lu = useLineups.getState();
  const agent = agents.find((a) => a.uuid === draft.agentId);
  const autoTitle = draft.land
    ? lineupTitle({ ...draft, title: '', land: draft.land })
    : (agent?.abilities.find((a) => a.slot === draft.slot)?.displayName ?? 'Lineup');

  const save = () => {
    const err = lu.saveDraft();
    usePlan.getState().showToast(err ?? 'Lineup saved');
  };

  const pickButton = (target: 'stand' | 'land') => {
    const point = draft[target];
    const where = point ? nearestCallout(map, point) : null;
    const on = picking === target;
    return (
      <button className={`pick-btn ${on ? 'on' : ''} ${point ? 'set' : ''}`} onClick={() => lu.setPicking(on ? null : target)}>
        {target === 'stand' ? <MapPin size={15} /> : <Crosshair size={15} />}
        <span>
          <strong>{target === 'stand' ? 'Stand spot' : 'Landing spot'}</strong>
          <small>{on ? 'Click the map…' : point ? (where ?? 'Set') : 'Not set'}</small>
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="lineups-head">
        <div>
          <h2>{draft.id ? 'Edit lineup' : 'New lineup'}</h2>
          <span className="muted small">{map?.displayName}</span>
        </div>
        <div className="panel-actions">
          <button className="icon-btn" onClick={lu.cancelDraft} {...tip('Discard changes', null, 'left')}>
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="lineups-body">
        <label className="field">
          <span className="field-label">Agent</span>
          <select className="input" value={draft.agentId} onChange={(e) => lu.updateDraft({ agentId: e.target.value })}>
            {agents.map((a) => (
              <option key={a.uuid} value={a.uuid}>
                {a.displayName}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="field-label">Ability</span>
          <div className="ability-pick">
            {SLOTS.map((slot) => {
              const ab = agent?.abilities.find((a) => a.slot === slot);
              if (!ab) return null;
              return (
                <button key={slot} className={draft.slot === slot ? 'on' : ''} onClick={() => lu.updateDraft({ slot })} {...tip(ab.displayName)}>
                  <img src={ab.displayIcon} alt="" />
                  <kbd>{SLOT_KEYS[slot]}</kbd>
                </button>
              );
            })}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Side</span>
          <div className="segmented full small">
            {(['both', 'attack', 'defense'] as const).map((side) => (
              <button key={side} className={draft.side === side ? 'on' : ''} onClick={() => lu.updateDraft({ side })}>
                {SIDE_LABEL[side]}
              </button>
            ))}
          </div>
        </div>
        <div className="pick-row">
          {pickButton('stand')}
          {pickButton('land')}
        </div>
        <label className="field">
          <span className="field-label">Title</span>
          <input className="input" value={draft.title} placeholder={autoTitle} onChange={(e) => lu.updateDraft({ title: e.target.value })} />
        </label>
        <div className="field">
          <span className="field-label">
            Screenshots <b>{draft.images.length}/{MAX_LINEUP_IMAGES}</b>
          </span>
          <div className="lineup-images">
            {draft.images.map((src, i) => (
              <span key={i} className="lineup-thumb">
                <button onClick={() => onZoom(src)} {...tip('View larger')}>
                  <img src={src} alt={`Screenshot ${i + 1}`} />
                </button>
                <button className="thumb-remove" onClick={() => lu.updateDraft({ images: draft.images.filter((_, j) => j !== i) })} {...tip('Remove')}>
                  <X size={12} />
                </button>
              </span>
            ))}
            {draft.images.length < MAX_LINEUP_IMAGES && (
              <button className="lineup-add-image" onClick={() => pickImageFiles(true).then(addLineupImages)} {...tip('Add screenshots (or paste one)')}>
                <ImagePlus size={18} />
              </button>
            )}
          </div>
          <span className="muted small">Where to stand, where to aim, and the result. Paste with Ctrl/⌘+V.</span>
        </div>
        <label className="field">
          <span className="field-label">Video link</span>
          <input className="input" type="url" value={draft.videoUrl} placeholder="https://youtube.com/…" onChange={(e) => lu.updateDraft({ videoUrl: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Notes</span>
          <textarea
            className="input notes"
            rows={3}
            value={draft.notes}
            placeholder="Crosshair placement, jump-throw, timing…"
            onChange={(e) => lu.updateDraft({ notes: e.target.value })}
          />
        </label>
        <div className="lineup-form-actions">
          <button className="btn ghost" onClick={lu.cancelDraft}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!draft.stand || !draft.land}>
            Save lineup
          </button>
        </div>
      </div>
    </>
  );
}
