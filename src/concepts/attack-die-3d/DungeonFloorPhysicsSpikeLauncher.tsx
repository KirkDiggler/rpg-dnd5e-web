import { useState } from 'react';
import DungeonFloorPhysicsSpike from './DungeonFloorPhysicsSpike';

export function DungeonFloorPhysicsSpikeLauncher() {
  const [enabled, setEnabled] = useState(false);
  if (!enabled)
    return (
      <section className="physics-tray-spike-launcher">
        <div>
          <span>Optional dream proof</span>
          <strong>Roll on the dungeon floor</strong>
          <p>
            Reuses the real SessionCanvas and reference-tomb geometry with
            floor, wall, and shut-door physics proxies.
          </p>
        </div>
        <button type="button" onClick={() => setEnabled(true)}>
          Load dungeon-floor physics spike
        </button>
      </section>
    );
  return <DungeonFloorPhysicsSpike />;
}
