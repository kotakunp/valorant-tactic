import { useMemo, useRef, useState } from 'react';
import { FileDown, FileUp, Folder, FolderPlus, Pencil, Search, Tag, Trash2, X } from 'lucide-react';
import { useGameData } from '../store/gameData';
import { usePlan } from '../store/planStore';
import { downloadPlanFile, readPlanFile } from '../lib/planFile';
import { tip } from '../lib/shortcuts';
import type { Plan, Side } from '../types';
import Modal from './Modal';

/** null = every strategy, '' = unfiled, otherwise a folder name. */
type FolderView = string | null;

export function parseTags(input: string): string[] {
  return [...new Set(input.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

export default function Library({ onClose }: { onClose: () => void }) {
  const library = usePlan((s) => s.library);
  const storedFolders = usePlan((s) => s.folders);
  const currentId = usePlan((s) => s.plan.id);
  const mapsById = useGameData((s) => s.mapsById);
  const a = usePlan.getState();
  const fileRef = useRef<HTMLInputElement>(null);

  const [folder, setFolder] = useState<FolderView>(null);
  const [query, setQuery] = useState('');
  const [mapId, setMapId] = useState('');
  const [side, setSide] = useState<Side | 'all'>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);

  // Imported plans can carry folder names this browser has never seen.
  const folders = useMemo(() => {
    const names = new Set(storedFolders);
    for (const p of library) if (p.folder) names.add(p.folder);
    return [...names].sort((x, y) => x.localeCompare(y));
  }, [storedFolders, library]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of library) m.set(p.folder ?? '', (m.get(p.folder ?? '') ?? 0) + 1);
    return m;
  }, [library]);

  const allTags = useMemo(() => [...new Set(library.flatMap((p) => p.tags ?? []))].sort(), [library]);
  const mapsInUse = useMemo(() => [...new Set(library.map((p) => p.mapId))].map((id) => mapsById[id]).filter(Boolean), [library, mapsById]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.filter((p) => {
      if (folder !== null && (p.folder ?? '') !== folder) return false;
      if (mapId && p.mapId !== mapId) return false;
      if (side !== 'all' && p.side !== side) return false;
      if (tag && !p.tags?.includes(tag)) return false;
      if (!q) return true;
      const hay = [p.title, mapsById[p.mapId]?.displayName ?? '', p.folder ?? '', ...(p.tags ?? []), ...p.steps.map((s) => `${s.name} ${s.notes}`)];
      return hay.some((s) => s.toLowerCase().includes(q));
    });
  }, [library, folder, mapId, side, tag, query, mapsById]);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const plan = await readPlanFile(file);
      if (!mapsById[plan.mapId]) throw new Error('That file uses a map that is no longer in the game data.');
      a.loadPlan(folder ? { ...plan, folder } : plan);
      a.showToast(`Imported "${plan.title}"`);
      onClose();
    } catch (err) {
      a.showToast(err instanceof Error ? err.message : 'Could not import that file');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const commitNewFolder = () => {
    const name = newFolder?.trim();
    if (name) {
      a.createFolder(name);
      setFolder(name);
    }
    setNewFolder(null);
  };

  const rename = (name: string) => {
    const next = window.prompt('Rename folder', name)?.trim();
    if (!next || next === name) return;
    a.renameFolder(name, next);
    if (folder === name) setFolder(next);
  };

  const remove = (name: string) => {
    const n = counts.get(name) ?? 0;
    if (!window.confirm(n ? `Delete the folder "${name}"? Its ${n} strateg${n === 1 ? 'y moves' : 'ies move'} to Unfiled.` : `Delete the folder "${name}"?`)) return;
    a.deleteFolder(name);
    if (folder === name) setFolder(null);
  };

  const filtered = query || mapId || side !== 'all' || tag;

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

      <div className="library-layout">
        <nav className="folder-list" aria-label="Folders">
          <FolderButton label="All strategies" count={library.length} on={folder === null} onClick={() => setFolder(null)} />
          <FolderButton label="Unfiled" count={counts.get('') ?? 0} on={folder === ''} onClick={() => setFolder('')} />
          {folders.map((f) => (
            <FolderButton key={f} label={f} count={counts.get(f) ?? 0} on={folder === f} onClick={() => setFolder(f)} onRename={() => rename(f)} onDelete={() => remove(f)} />
          ))}
          {newFolder !== null ? (
            <input
              className="input folder-new"
              autoFocus
              value={newFolder}
              placeholder="Folder name"
              onChange={(e) => setNewFolder(e.target.value)}
              onBlur={commitNewFolder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitNewFolder();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setNewFolder(null);
                }
              }}
            />
          ) : (
            <button className="folder-add" onClick={() => setNewFolder('')}>
              <FolderPlus size={14} /> New folder
            </button>
          )}
        </nav>

        <div className="library-main">
          <div className="library-filters">
            <label className="search">
              <Search size={14} />
              <input value={query} placeholder="Search titles, notes, tags" onChange={(e) => setQuery(e.target.value)} />
            </label>
            <select className="input" value={mapId} onChange={(e) => setMapId(e.target.value)} aria-label="Map">
              <option value="">All maps</option>
              {mapsInUse.map((m) => (
                <option key={m.uuid} value={m.uuid}>
                  {m.displayName}
                </option>
              ))}
            </select>
            <div className="segmented small">
              {(['all', 'attack', 'defense'] as const).map((s) => (
                <button key={s} className={side === s ? 'on' : ''} onClick={() => setSide(s)}>
                  {s === 'all' ? 'Both' : s === 'attack' ? 'Atk' : 'Def'}
                </button>
              ))}
            </div>
          </div>
          {allTags.length > 0 && (
            <div className="tag-filter">
              {allTags.map((t) => (
                <button key={t} className={`tag-chip ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
                  #{t}
                </button>
              ))}
            </div>
          )}

          {library.length === 0 ? (
            <p className="muted">Nothing here yet. Place something on the map and it shows up here.</p>
          ) : shown.length === 0 ? (
            <p className="muted">{filtered ? 'No strategies match these filters.' : 'This folder is empty. Move strategies here with the folder menu on each row.'}</p>
          ) : (
            <ul className="library">
              {shown.map((p) => (
                <LibraryRow
                  key={p.id}
                  plan={p}
                  current={p.id === currentId}
                  folders={folders}
                  onOpen={() => {
                    a.loadPlan(structuredClone(p));
                    onClose();
                  }}
                  onTag={setTag}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function FolderButton({
  label,
  count,
  on,
  onClick,
  onRename,
  onDelete,
}: {
  label: string;
  count: number;
  on: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className={`folder ${on ? 'on' : ''}`}>
      <button className="folder-open" onClick={onClick} aria-pressed={on}>
        <Folder size={14} />
        <span>{label}</span>
        <b>{count}</b>
      </button>
      {onRename && (
        <button className="folder-tool" onClick={onRename} {...tip('Rename folder')}>
          <Pencil size={12} />
        </button>
      )}
      {onDelete && (
        <button className="folder-tool danger" onClick={onDelete} {...tip('Delete folder')}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function LibraryRow({
  plan: p,
  current,
  folders,
  onOpen,
  onTag,
}: {
  plan: Plan;
  current: boolean;
  folders: string[];
  onOpen: () => void;
  onTag: (t: string) => void;
}) {
  const map = useGameData((s) => s.mapsById[p.mapId]);
  const a = usePlan.getState();
  const [tagDraft, setTagDraft] = useState<string | null>(null);

  const commitTags = () => {
    if (tagDraft === null) return;
    a.updateLibraryPlan(p.id, { tags: parseTags(tagDraft) });
    setTagDraft(null);
  };

  return (
    <li className={current ? 'on' : ''}>
      <div className="library-row">
        <button className="library-open" onClick={onOpen}>
          {map && <img src={map.listViewIcon} alt="" />}
          <span>
            <strong>
              {p.title}
              {p.live && <em className="library-live">Live</em>}
              {current && <em className="library-current">Open</em>}
            </strong>
            <small>
              {map?.displayName ?? 'Unknown map'} · {p.side === 'attack' ? 'Attack' : 'Defense'} · {p.steps.length} step{p.steps.length === 1 ? '' : 's'} ·{' '}
              {new Date(p.updatedAt).toLocaleString()}
            </small>
          </span>
        </button>
        <select
          className="input folder-select"
          value={p.folder ?? ''}
          onChange={(e) => a.updateLibraryPlan(p.id, { folder: e.target.value || undefined })}
          {...tip('Move to folder', null, 'left')}
        >
          <option value="">Unfiled</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button className="icon-btn" onClick={() => setTagDraft((p.tags ?? []).join(', '))} {...tip('Edit tags', null, 'left')}>
          <Tag size={15} />
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
      </div>
      {tagDraft !== null ? (
        <input
          className="input tag-input"
          autoFocus
          value={tagDraft}
          placeholder="Comma-separated tags, e.g. retake, eco, pistol"
          onChange={(e) => setTagDraft(e.target.value)}
          onBlur={commitTags}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitTags();
            if (e.key === 'Escape') {
              e.stopPropagation();
              setTagDraft(null);
            }
          }}
        />
      ) : (
        p.tags &&
        p.tags.length > 0 && (
          <div className="library-tags">
            {p.tags.map((t) => (
              <button key={t} className="tag-chip" onClick={() => onTag(t)}>
                #{t}
              </button>
            ))}
          </div>
        )
      )}
    </li>
  );
}
