import { useRef } from 'react';
import { FileDown, FileUp, Trash2 } from 'lucide-react';
import { useGameData } from '../store/gameData';
import { usePlan } from '../store/planStore';
import { downloadPlanFile, readPlanFile } from '../lib/planFile';
import { tip } from '../lib/shortcuts';
import Modal from './Modal';

export default function Library({ onClose }: { onClose: () => void }) {
  const library = usePlan((s) => s.library);
  const currentId = usePlan((s) => s.plan.id);
  const mapsById = useGameData((s) => s.mapsById);
  const a = usePlan.getState();
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const plan = await readPlanFile(file);
      if (!mapsById[plan.mapId]) throw new Error('That file uses a map that is no longer in the game data.');
      a.loadPlan(plan);
      a.showToast(`Imported "${plan.title}"`);
      onClose();
    } catch (err) {
      a.showToast(err instanceof Error ? err.message : 'Could not import that file');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Modal title="Library" onClose={onClose} wide>
      <div className="library-head">
        <p className="muted small">
          Every strategy is saved automatically in this browser, so closing the tab keeps your work. To use it on another device or
          browser, send a share link or export a file.
        </p>
        <button className="btn ghost" onClick={() => fileRef.current?.click()} {...tip('Open a .json strategy file')}>
          <FileUp size={15} /> Import file
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
      </div>
      {library.length === 0 ? (
        <p className="muted">Nothing here yet. Place something on the map and it shows up here.</p>
      ) : (
        <ul className="library">
          {library.map((p) => {
            const map = mapsById[p.mapId];
            return (
              <li key={p.id} className={p.id === currentId ? 'on' : ''}>
                <button
                  className="library-open"
                  onClick={() => {
                    a.loadPlan(structuredClone(p));
                    onClose();
                  }}
                >
                  {map && <img src={map.listViewIcon} alt="" />}
                  <span>
                    <strong>
                      {p.title}
                      {p.id === currentId && <em className="library-current">Open</em>}
                    </strong>
                    <small>
                      {map?.displayName ?? 'Unknown map'} · {p.side === 'attack' ? 'Attack' : 'Defense'} · {p.steps.length} step{p.steps.length === 1 ? '' : 's'} ·{' '}
                      {new Date(p.updatedAt).toLocaleString()}
                    </small>
                  </span>
                </button>
                <button className="icon-btn" onClick={() => downloadPlanFile(p)} {...tip('Export as .json file', null, 'left')}>
                  <FileDown size={16} />
                </button>
                <button
                  className="icon-btn danger"
                  onClick={() => {
                    if (window.confirm(`Delete "${p.title}"? This can't be undone.`)) a.deleteFromLibrary(p.id);
                  }}
                  {...tip('Delete', null, 'left')}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
