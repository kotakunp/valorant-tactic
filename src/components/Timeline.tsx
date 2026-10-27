import { useState } from 'react';
import { ChevronLeft, ChevronRight, CopyPlus, Play, Plus, Square, Trash2, X } from 'lucide-react';
import { usePlan } from '../store/planStore';
import { tip, tipFor } from '../lib/shortcuts';
import { togglePlayback } from '../lib/playback';

export default function Timeline() {
  const steps = usePlan((s) => s.plan.steps);
  const stepIndex = usePlan((s) => s.stepIndex);
  const playing = usePlan((s) => s.playback !== null);
  const a = usePlan.getState();
  const [renaming, setRenaming] = useState<number | null>(null);

  return (
    <footer className="timeline">
      <div className="timeline-controls">
        <button className={`btn ${playing ? 'danger' : 'primary'} play`} onClick={togglePlayback} {...tipFor('play', 'top', 'Animate through all steps')}>
          {playing ? <Square size={14} /> : <Play size={14} />} {playing ? 'Stop' : 'Play'}
        </button>
        <button className="icon-btn" disabled={playing || stepIndex === 0} onClick={() => a.setStepIndex(stepIndex - 1)} {...tipFor('prevStep', 'top')}>
          <ChevronLeft size={18} />
        </button>
        <button className="icon-btn" disabled={playing || stepIndex === steps.length - 1} onClick={() => a.setStepIndex(stepIndex + 1)} {...tipFor('nextStep', 'top')}>
          <ChevronRight size={18} />
        </button>
      </div>

      <ol className="steps">
        {steps.map((st, i) => (
          <li key={st.id} className={`step ${i === stepIndex ? 'on' : ''}`}>
            <button className="step-btn" disabled={playing} onClick={() => a.setStepIndex(i)} onDoubleClick={() => setRenaming(i)} {...tip(`${st.name}: double-click to rename`, null, 'top')}>
              <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
              {renaming === i ? (
                <input
                  className="step-rename"
                  autoFocus
                  defaultValue={st.name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    a.renameStep(i, e.target.value.trim() || st.name);
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <span className="step-name">{st.name}</span>
              )}
              <span className="step-count">{st.elements.length}</span>
            </button>
            {steps.length > 1 && !playing && (
              <button className="step-del" onClick={() => a.removeStep(i)} {...tip('Delete step', null, 'top')}>
                <X size={12} />
              </button>
            )}
          </li>
        ))}
      </ol>

      <div className="timeline-controls">
        <button className="btn ghost" disabled={playing} onClick={() => a.addStep(false)} {...tipFor('newStep', 'top', 'Next step: continues from this one')}>
          <CopyPlus size={15} /> Next step
        </button>
        <button className="icon-btn" disabled={playing} onClick={() => a.addStep(true)} {...tipFor('blankStep', 'top')}>
          <Plus size={17} />
        </button>
        <button
          className="icon-btn danger"
          disabled={playing}
          onClick={() => {
            if (window.confirm('Clear everything in this step?')) a.clearStep();
          }}
          {...tip('Clear this step', null, 'top')}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </footer>
  );
}
