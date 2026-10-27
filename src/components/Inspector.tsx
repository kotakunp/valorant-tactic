import { Copy, Trash2 } from 'lucide-react';
import { usePlan, useCurrentStep } from '../store/planStore';
import { useGameData } from '../store/gameData';
import { DRAW_COLORS, TEAM_COLORS } from '../lib/colors';
import { SLOT_KEYS } from '../lib/abilityPresets';
import { OBJECTS } from '../lib/objects';
import type { AgentEl, BoardEl, OverlayShape, Team } from '../types';
import { DEFAULT_FOV, DEFAULT_VISION_RANGE, normalizeAngle } from '../lib/elements';
import { useStepSightings } from '../lib/useStepSightings';
import type { ApiAgent } from '../api/valorant';
import { tip, tipFor } from '../lib/shortcuts';
import { Keyboard } from 'lucide-react';

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden />
    </label>
  );
}

function TeamPicker({ team, onChange }: { team: Team; onChange: (t: Team) => void }) {
  return (
    <div className="segmented full small">
      {(['ally', 'enemy'] as Team[]).map((t) => (
        <button key={t} className={team === t ? 'on' : ''} onClick={() => onChange(t)}>
          <i className="dot" style={{ background: TEAM_COLORS[t] }} /> {t === 'ally' ? 'Ally' : 'Enemy'}
        </button>
      ))}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatch-row">
      {DRAW_COLORS.map((c) => (
        <button key={c} className={`swatch ${value === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange(c)} aria-label={`Color ${c}`} />
      ))}
    </div>
  );
}

function AgentChips({ ids, elements, agentsById }: { ids: string[]; elements: BoardEl[]; agentsById: Record<string, ApiAgent> }) {
  const a = usePlan.getState();
  if (!ids.length) return <span className="muted small">Nobody</span>;
  return (
    <div className="roster-icons">
      {ids.map((id) => {
        const el = elements.find((e) => e.id === id);
        const ag = el?.kind === 'agent' ? agentsById[el.agentId] : undefined;
        return el?.kind === 'agent' && ag ? (
          <button key={id} className="roster-icon" style={{ borderColor: TEAM_COLORS[el.team] }} {...tip(ag.displayName)} onClick={() => a.select(id)}>
            <img src={ag.displayIconSmall} alt={ag.displayName} />
          </button>
        ) : null;
      })}
    </div>
  );
}

function VisionControls({ el }: { el: AgentEl }) {
  const a = usePlan.getState();
  const agentsById = useGameData((s) => s.agentsById);
  const elements = useCurrentStep().elements;
  const sightings = useStepSightings();
  const showSightLines = usePlan((s) => s.settings.showSightLines);
  const update = (patch: Partial<AgentEl>, key?: string) => a.updateElement(el.id, patch, key);
  const sees = sightings.filter((s) => s.viewerId === el.id).map((s) => s.targetId);
  const seenBy = sightings.filter((s) => s.targetId === el.id).map((s) => s.viewerId);
  const facing = Math.round(normalizeAngle(el.facing ?? 0));

  return (
    <>
      <Toggle label="Vision cone" checked={!!el.vision} onChange={(vision) => update({ vision, facing: el.facing ?? 0 })} />
      {el.vision && (
        <>
          <label className="field">
            <span className="field-label">
              Facing <b>{facing}°</b>
            </span>
            <input type="range" min={-180} max={180} step={1} value={facing} onChange={(e) => update({ facing: Number(e.target.value) }, `facing-${el.id}`)} />
          </label>
          <label className="field">
            <span className="field-label">
              Field of view <b>{el.fov ?? DEFAULT_FOV}°</b>
            </span>
            <input type="range" min={20} max={120} step={1} value={el.fov ?? DEFAULT_FOV} onChange={(e) => update({ fov: Number(e.target.value) }, `fov-${el.id}`)} />
          </label>
          <label className="field">
            <span className="field-label">
              Range <b>{el.range ?? DEFAULT_VISION_RANGE} m</b>
            </span>
            <input type="range" min={5} max={120} step={1} value={el.range ?? DEFAULT_VISION_RANGE} onChange={(e) => update({ range: Number(e.target.value) }, `range-${el.id}`)} />
          </label>
          <p className="muted small">Drag the white handle in front of the agent to aim, or press [ and ] to turn. 103° matches the in-game horizontal FOV.</p>
        </>
      )}
      {showSightLines && (
        <div className="sight-summary">
          <div>
            <span className="field-label">Has eyes on</span>
            <AgentChips ids={sees} elements={elements} agentsById={agentsById} />
          </div>
          <div>
            <span className="field-label">
              Seen by {seenBy.length > 1 && <b className="crossfire-tag">Crossfire ×{seenBy.length}</b>}
            </span>
            <AgentChips ids={seenBy} elements={elements} agentsById={agentsById} />
          </div>
        </div>
      )}
    </>
  );
}

function Selection({ el }: { el: BoardEl }) {
  const agentsById = useGameData((s) => s.agentsById);
  const a = usePlan.getState();
  const update = (patch: Partial<BoardEl>, key?: string) => a.updateElement(el.id, patch, key);

  let title = '';
  let subtitle = '';
  let body: React.ReactNode = null;

  switch (el.kind) {
    case 'agent': {
      const agent = agentsById[el.agentId];
      title = agent?.displayName ?? 'Agent';
      subtitle = agent?.role?.displayName ?? '';
      body = (
        <>
          {agent?.bustPortrait && (
            <div className="agent-portrait" style={{ background: `linear-gradient(135deg, #${agent.backgroundGradientColors?.[0] ?? '1f2933'}, #${agent.backgroundGradientColors?.[2] ?? '0f1923'})` }}>
              <img src={agent.bustPortrait} alt="" />
            </div>
          )}
          <TeamPicker team={el.team} onChange={(team) => update({ team })} />
          <VisionControls el={el} />
        </>
      );
      break;
    }
    case 'ability': {
      const agent = agentsById[el.agentId];
      const ability = agent?.abilities.find((x) => x.slot === el.slot);
      title = ability?.displayName ?? 'Ability';
      subtitle = `${agent?.displayName ?? ''} · ${SLOT_KEYS[el.slot]}`;
      body = (
        <>
          {ability?.description && <p className="ability-desc">{ability.description}</p>}
          <TeamPicker team={el.team} onChange={(team) => update({ team })} />
          <div className="field">
            <span className="field-label">Range overlay</span>
            <div className="segmented full small">
              {(['none', 'circle', 'wall'] as OverlayShape[]).map((shape) => (
                <button key={shape} className={el.shape === shape ? 'on' : ''} onClick={() => update({ shape })}>
                  {shape === 'none' ? 'Icon only' : shape === 'circle' ? 'Radius' : 'Wall'}
                </button>
              ))}
            </div>
          </div>
          {el.shape !== 'none' && (
            <>
              <label className="field">
                <span className="field-label">
                  {el.shape === 'circle' ? 'Radius' : 'Length'} <b>{el.size.toFixed(1)} m</b>
                </span>
                <input type="range" min={0.5} max={60} step={0.1} value={el.size} onChange={(e) => update({ size: Number(e.target.value) }, `size-${el.id}`)} />
              </label>
              {el.shape === 'wall' && (
                <label className="field">
                  <span className="field-label">
                    Rotation <b>{Math.round(el.rotation)}°</b>
                  </span>
                  <input type="range" min={-180} max={180} step={1} value={el.rotation} onChange={(e) => update({ rotation: Number(e.target.value) }, `rot-${el.id}`)} />
                </label>
              )}
              <Toggle label="Blocks vision" checked={!!el.blocksVision} onChange={(blocksVision) => update({ blocksVision })} />
              <p className="muted small">Drag the white handle on the map to resize or aim. Sizes are approximate, measured in meters at map scale.</p>
            </>
          )}
        </>
      );
      break;
    }
    case 'object':
      title = OBJECTS.find((o) => o.kind === el.object)?.label ?? 'Marker';
      subtitle = 'Marker';
      break;
    case 'stroke':
      title = el.smooth ? 'Drawing' : 'Line';
      subtitle = 'Stroke';
      body = (
        <>
          <ColorPicker value={el.color} onChange={(color) => update({ color })} />
          <label className="field">
            <span className="field-label">
              Width <b>{el.width}px</b>
            </span>
            <input type="range" min={1} max={12} step={1} value={el.width} onChange={(e) => update({ width: Number(e.target.value) }, `w-${el.id}`)} />
          </label>
          <Toggle label="Arrow head" checked={el.arrow} onChange={(arrow) => update({ arrow })} />
          <Toggle label="Dashed" checked={el.dashed} onChange={(dashed) => update({ dashed })} />
        </>
      );
      break;
    case 'text':
      title = 'Text';
      subtitle = 'Label';
      body = (
        <>
          <input className="input" value={el.text} onChange={(e) => update({ text: e.target.value }, `t-${el.id}`)} />
          <ColorPicker value={el.color} onChange={(color) => update({ color })} />
          <label className="field">
            <span className="field-label">
              Size <b>{el.size}px</b>
            </span>
            <input type="range" min={10} max={60} step={1} value={el.size} onChange={(e) => update({ size: Number(e.target.value) }, `s-${el.id}`)} />
          </label>
        </>
      );
      break;
    case 'area':
      title = 'Area';
      subtitle = 'Zone';
      body = (
        <>
          <ColorPicker value={el.color} onChange={(color) => update({ color })} />
          <label className="field">
            <span className="field-label">
              Radius <b>{Math.round(el.radius)}</b>
            </span>
            <input type="range" min={5} max={300} step={1} value={el.radius} onChange={(e) => update({ radius: Number(e.target.value) }, `r-${el.id}`)} />
          </label>
        </>
      );
      break;
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <span className="muted small">{subtitle}</span>}
        </div>
        <div className="panel-actions">
          <button className="icon-btn" {...tipFor('duplicate')} onClick={() => a.duplicateElement(el.id)}>
            <Copy size={15} />
          </button>
          <button className="icon-btn danger" {...tipFor('delete')} onClick={() => a.removeElement(el.id)}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className="stack">{body}</div>
    </section>
  );
}

export default function Inspector({ onOpenHelp }: { onOpenHelp: () => void }) {
  const plan = usePlan((s) => s.plan);
  const settings = usePlan((s) => s.settings);
  const selectedId = usePlan((s) => s.selectedId);
  const step = useCurrentStep();
  const stepIndex = usePlan((s) => s.stepIndex);
  const map = useGameData((s) => s.mapsById[plan.mapId]);
  const agentsById = useGameData((s) => s.agentsById);
  const a = usePlan.getState();
  const selected = step.elements.find((el) => el.id === selectedId);

  const roster = (team: Team) => step.elements.filter((el) => el.kind === 'agent' && el.team === team);

  return (
    <aside className="sidebar sidebar-right">
      {map && (
        <section className="map-card" style={{ backgroundImage: `url(${map.splash})` }}>
          <div className="map-card-inner">
            <span className="eyebrow">{map.tacticalDescription}</span>
            <h3>{map.displayName}</h3>
            {map.coordinates && <span className="coords">{map.coordinates}</span>}
          </div>
        </section>
      )}

      {selected ? (
        <Selection el={selected} />
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>Lineup · step {stepIndex + 1}</h2>
          </div>
          {(['ally', 'enemy'] as Team[]).map((team) => {
            const list = roster(team);
            return (
              <div key={team} className="roster">
                <span className="roster-label" style={{ color: TEAM_COLORS[team] }}>
                  {team === 'ally' ? 'Allies' : 'Enemies'} <b>{list.length}/5</b>
                </span>
                <div className="roster-icons">
                  {list.map((el) => {
                    const ag = el.kind === 'agent' ? agentsById[el.agentId] : undefined;
                    return ag ? (
                      <button key={el.id} className="roster-icon" style={{ borderColor: TEAM_COLORS[team] }} {...tip(ag.displayName)} onClick={() => a.select(el.id)}>
                        <img src={ag.displayIconSmall} alt={ag.displayName} />
                      </button>
                    ) : null;
                  })}
                  {list.length === 0 && <span className="muted small">None placed</span>}
                </div>
              </div>
            );
          })}
          <p className="muted small">Select anything on the map to edit it here.</p>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Step notes</h2>
        </div>
        <textarea
          className="input notes"
          placeholder="What happens in this step? Timings, calls, fallbacks…"
          value={step.notes}
          onChange={(e) => a.setStepNotes(e.target.value)}
          rows={4}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Display</h2>
        </div>
        <div className="stack">
          <Toggle label="Callouts" checked={settings.showCallouts} onChange={(v) => a.setSettings({ showCallouts: v })} />
          <Toggle label="Ability ranges" checked={settings.showRanges} onChange={(v) => a.setSettings({ showRanges: v })} />
          <Toggle label="Ghost previous step" checked={settings.onionSkin} onChange={(v) => a.setSettings({ onionSkin: v })} />
          <Toggle label="Vision cones" checked={settings.showVision} onChange={(v) => a.setSettings({ showVision: v })} />
          <Toggle label="Walls block vision" checked={settings.lineOfSight} onChange={(v) => a.setSettings({ lineOfSight: v })} />
          <Toggle label="Sight lines & crossfire" checked={settings.showSightLines} onChange={(v) => a.setSettings({ showSightLines: v })} />
          <p className="muted small">Vision is simulated on the minimap: walls and vision-blocking utility stop sight. Boxes and height differences don't.</p>
          <label className="field">
            <span className="field-label">
              Icon size <b>{Math.round(settings.iconScale * 100)}%</b>
            </span>
            <input type="range" min={0.6} max={1.8} step={0.05} value={settings.iconScale} onChange={(e) => a.setSettings({ iconScale: Number(e.target.value) })} />
          </label>
        </div>
      </section>

      <section className="panel">
        <button className="btn ghost full-width" onClick={onOpenHelp} {...tipFor('help')}>
          <Keyboard size={15} /> Keyboard shortcuts
        </button>
      </section>
    </aside>
  );
}
