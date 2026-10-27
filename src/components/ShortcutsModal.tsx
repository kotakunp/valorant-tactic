import Modal from './Modal';
import { SHORTCUTS, SHORTCUT_GROUPS, formatCombo } from '../lib/shortcuts';

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} wide>
      <div className="shortcut-groups">
        {SHORTCUT_GROUPS.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.ids.map((id) => (
                <div key={id} className="shortcut-row">
                  <dt>{SHORTCUTS[id].label}</dt>
                  <dd>
                    {SHORTCUTS[id].keys.map((combo, i) => (
                      <span key={combo} className="combo">
                        {i > 0 && <span className="or">or</span>}
                        {formatCombo(combo).map((k) => (
                          <kbd key={k}>{k}</kbd>
                        ))}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
