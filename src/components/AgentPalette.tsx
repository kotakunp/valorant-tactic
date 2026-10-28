import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { usePlan } from '../store/planStore';
import { useGameData } from '../store/gameData';
import { SLOT_KEYS } from '../lib/abilityPresets';
import { OBJECTS } from '../lib/objects';
import { TEAM_COLORS } from '../lib/colors';
import type { PalettePayload } from '../types';
import { tip, tipFor } from '../lib/shortcuts';

function dragProps(payload: PalettePayload) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      // Dragging places the piece on drop, so an earlier click-to-place must not leave another one waiting.
      usePlan.getState().setArmed(null);
      e.dataTransfer.setData('application/x-valo', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'copy';
    },
  };
}

function samePayload(a: PalettePayload | null, b: PalettePayload) {
  return !!a && JSON.stringify(a) === JSON.stringify(b);
}

export default function AgentPalette() {
  const agents = useGameData((s) => s.agents);
  const agentsById = useGameData((s) => s.agentsById);
  const team = usePlan((s) => s.team);
  const armed = usePlan((s) => s.armed);
  const focusAgentId = usePlan((s) => s.focusAgentId);
  const a = usePlan.getState();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<string | null>(null);

  const roles = useMemo(() => {
    const seen = new Map<string, { name: string; icon: string }>();
    agents.forEach((ag) => ag.role && seen.set(ag.role.displayName, { name: ag.role.displayName, icon: ag.role.displayIcon }));
    return [...seen.values()].sort((x, y) => x.name.localeCompare(y.name));
  }, [agents]);

  const visible = agents.filter(
    (ag) => (!role || ag.role?.displayName === role) && ag.displayName.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const focus = focusAgentId ? agentsById[focusAgentId] : null;

  const arm = (payload: PalettePayload) => a.setArmed(samePayload(armed, payload) ? null : payload);

  return (
    <aside className="sidebar sidebar-left">
      <section className="panel">
        <div className="panel-head">
          <h2>Team</h2>
        </div>
        <div className="segmented full" role="radiogroup" aria-label="Team for placed agents and abilities">
          <button role="radio" aria-checked={team === 'ally'} className={team === 'ally' ? 'on' : ''} onClick={() => a.setTeam('ally')} {...tipFor('team', 'bottom', 'Place as ally')}>
            <i className="dot" style={{ background: TEAM_COLORS.ally }} /> Ally
          </button>
          <button role="radio" aria-checked={team === 'enemy'} className={team === 'enemy' ? 'on' : ''} onClick={() => a.setTeam('enemy')} {...tipFor('team', 'bottom', 'Place as enemy')}>
            <i className="dot" style={{ background: TEAM_COLORS.enemy }} /> Enemy
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Agents</h2>
          <span className="muted">{visible.length}</span>
        </div>
        <label className="search">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agents" />
        </label>
        <div className="role-filter">
          <button className={!role ? 'on' : ''} onClick={() => setRole(null)}>
            All
          </button>
          {roles.map((r) => (
            <button key={r.name} className={role === r.name ? 'on' : ''} onClick={() => setRole(role === r.name ? null : r.name)} {...tip(`Show ${r.name}s only`)}>
              <img src={r.icon} alt="" />
              <span>{r.name}</span>
            </button>
          ))}
        </div>
        <div className="agent-grid">
          {visible.map((ag) => {
            const payload: PalettePayload = { kind: 'agent', agentId: ag.uuid };
            return (
              <button
                key={ag.uuid}
                className={`agent-tile ${focusAgentId === ag.uuid ? 'focused' : ''} ${samePayload(armed, payload) ? 'armed' : ''}`}
                style={{ ['--team' as string]: TEAM_COLORS[team] }}
                {...tip(`${ag.displayName} · ${ag.role?.displayName ?? ''}: click to place, or drag onto the map`, null, 'right')}
                onClick={() => {
                  a.setFocusAgent(ag.uuid);
                  arm(payload);
                }}
                {...dragProps(payload)}
                onDragStartCapture={() => a.setFocusAgent(ag.uuid)}
              >
                <img src={ag.displayIconSmall} alt={ag.displayName} loading="lazy" />
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{focus ? `${focus.displayName} abilities` : 'Abilities'}</h2>
          {focus?.role && <img className="role-icon" src={focus.role.displayIcon} alt={focus.role.displayName} {...tip(focus.role.displayName)} />}
        </div>
        {!focus && <p className="muted small">Pick an agent to see their abilities.</p>}
        {focus && (
          <div className="ability-list">
            {focus.abilities.map((ab) => {
              const payload: PalettePayload = { kind: 'ability', agentId: focus.uuid, slot: ab.slot };
              return (
                <button
                  key={ab.slot}
                  className={`ability-tile ${samePayload(armed, payload) ? 'armed' : ''}`}
                  style={{ ['--team' as string]: TEAM_COLORS[team] }}
                  onClick={() => arm(payload)}
                  {...tip(`${ab.displayName}: click to place, or drag onto the map`, null, 'right')}
                  {...dragProps(payload)}
                >
                  <span className="ability-icon">
                    <img src={ab.displayIcon} alt="" />
                  </span>
                  <span className="ability-text">
                    <strong>{ab.displayName}</strong>
                    <small>{ab.slot === 'Ultimate' ? 'Ultimate' : 'Ability'} · {SLOT_KEYS[ab.slot]}</small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Markers</h2>
        </div>
        <div className="marker-grid">
          {OBJECTS.map((o) => {
            const payload: PalettePayload = { kind: 'object', object: o.kind };
            return (
              <button key={o.kind} className={`marker-tile ${samePayload(armed, payload) ? 'armed' : ''}`} onClick={() => arm(payload)} {...tip(`${o.label} marker`)} {...dragProps(payload)}>
                <img src={o.icon} alt="" />
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
