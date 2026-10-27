import { useGameData } from '../store/gameData';
import { usePlan } from '../store/planStore';
import Modal from './Modal';

export default function MapPicker({ onClose }: { onClose: () => void }) {
  const maps = useGameData((s) => s.maps);
  const plan = usePlan((s) => s.plan);

  const choose = (mapId: string) => {
    if (mapId !== plan.mapId) {
      const hasContent = plan.steps.some((s) => s.elements.length > 0);
      if (hasContent && !window.confirm('Switching maps clears every step of this strategy. Continue?')) return;
      usePlan.getState().setMap(mapId);
    }
    onClose();
  };

  return (
    <Modal title="Choose a map" onClose={onClose} wide>
      <div className="map-grid">
        {maps.map((m) => (
          <button key={m.uuid} className={`map-tile ${m.uuid === plan.mapId ? 'on' : ''}`} onClick={() => choose(m.uuid)}>
            <img src={m.listViewIcon} alt="" loading="lazy" />
            <span className="map-tile-label">
              <strong>{m.displayName}</strong>
              <small>{m.tacticalDescription}</small>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
