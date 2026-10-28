import { useState } from 'react';
import { Copy, Eye, GitFork, LogOut, Pencil, Radio } from 'lucide-react';
import Modal from './Modal';
import { usePlan } from '../store/planStore';
import { useCollab, forkLiveSession, leaveLiveSession, startLiveSession } from '../collab/session';
import { PEER_COLORS, displayName, useProfile } from '../collab/profile';
import { inviteUrl } from '../collab/api';

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    usePlan.getState().showToast(done);
  } catch {
    window.prompt('Copy this link', text);
  }
}

function ProfileFields() {
  const name = useProfile((s) => s.name);
  const color = useProfile((s) => s.color);
  const p = useProfile.getState();
  return (
    <div className="live-profile">
      <label className="field">
        <span className="field-label">Your name</span>
        <input className="input" value={name} maxLength={24} onChange={(e) => p.setName(e.target.value)} placeholder="Shown next to your cursor" />
      </label>
      <div className="live-colors" role="radiogroup" aria-label="Cursor color">
        {PEER_COLORS.map((c) => (
          <button key={c} role="radio" aria-checked={c === color} className={c === color ? 'on' : ''} style={{ background: c }} onClick={() => p.setColor(c)} aria-label={c} />
        ))}
      </div>
    </div>
  );
}

export default function LiveModal({ onClose }: { onClose: () => void }) {
  const live = usePlan((s) => s.plan.live);
  const steps = usePlan((s) => s.plan.steps.length);
  const myStep = usePlan((s) => s.stepIndex);
  const status = useCollab((s) => s.status);
  const role = useCollab((s) => s.role);
  const ready = useCollab((s) => s.ready);
  const unsynced = useCollab((s) => s.unsynced);
  const peers = useCollab((s) => s.peers);
  const me = useProfile((s) => s.name);
  const myColor = useProfile((s) => s.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await startLiveSession();
      usePlan.getState().showToast('Live session started. Copy a link to invite people.');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start a live session");
    } finally {
      setBusy(false);
    }
  };

  if (!live) {
    return (
      <Modal title="Live session" onClose={onClose}>
        <div className="live">
          <p>
            Plan with your team in real time. Everyone with the edit link can move pieces, draw and add steps, and you see their cursors as
            they work. A view-only link lets others follow along.
          </p>
          <ProfileFields />
          <button className="btn primary full-width" disabled={busy} onClick={start}>
            <Radio size={16} /> {busy ? 'Starting…' : 'Start live session'}
          </button>
          {error && <p className="live-error">{error}</p>}
          <p className="muted small">
            While the session exists, the strategy and its images are stored on this site's server. Anyone with a link can open it, so only
            share links with people you trust.
          </p>
        </div>
      </Modal>
    );
  }

  const statusText = !ready
    ? status === 'offline'
      ? "Can't reach the server. Retrying…"
      : 'Connecting…'
    : status === 'connected'
      ? unsynced
        ? 'Connected · syncing'
        : 'Connected · all changes synced'
      : status === 'offline'
        ? 'Offline. Your edits are kept and sync when you reconnect.'
        : 'Reconnecting…';
  const canEdit = role !== 'view';

  return (
    <Modal title="Live session" onClose={onClose}>
      <div className="live">
        <div className={`live-status ${status}`}>
          <span className="live-dot" />
          <span>{statusText}</span>
          <span className="live-role">
            {canEdit ? <Pencil size={13} /> : <Eye size={13} />} {canEdit ? 'Can edit' : 'View only'}
          </span>
        </div>

        <ProfileFields />

        <div className="live-people">
          <span className="field-label">
            Here now <b>{peers.length + 1}</b>
          </span>
          <ul>
            <li>
              <i style={{ background: myColor }} />
              <span>{displayName(me)} (you)</span>
              <small>Step {Math.min(myStep, steps - 1) + 1}</small>
            </li>
            {peers.map((p) => (
              <li key={p.id}>
                <i style={{ background: p.color }} />
                <span>{p.name}</span>
                <small>Step {Math.min(p.step, steps - 1) + 1}</small>
              </li>
            ))}
          </ul>
        </div>

        <div className="live-invite">
          <span className="field-label">Invite</span>
          {canEdit && (
            <button className="btn ghost full-width" onClick={() => copy(inviteUrl(live, 'edit'), 'Edit link copied. Anyone with it can change this strategy.')}>
              <Copy size={15} /> Copy edit link
            </button>
          )}
          {(live.viewToken || !canEdit) && (
            <button className="btn ghost full-width" onClick={() => copy(inviteUrl(live, 'view'), 'View-only link copied')}>
              <Eye size={15} /> Copy view-only link
            </button>
          )}
        </div>

        <div className="live-actions">
          <button
            className="btn ghost"
            onClick={() => {
              forkLiveSession();
              usePlan.getState().showToast('Saved a personal copy. It no longer syncs.');
              onClose();
            }}
          >
            <GitFork size={15} /> Personal copy
          </button>
          <button
            className="btn danger"
            onClick={() => {
              leaveLiveSession();
              usePlan.getState().showToast('Left the session. Open it from your Library to rejoin.');
              onClose();
            }}
          >
            <LogOut size={15} /> Leave
          </button>
        </div>
        <p className="muted small">Undo only takes back your own changes. Leaving keeps the strategy in your Library; open it there to rejoin.</p>
      </div>
    </Modal>
  );
}
