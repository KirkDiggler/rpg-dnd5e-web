import { useState } from 'react';
import PhysicsTraySpike from './PhysicsTraySpike';

export function PhysicsTraySpikeLauncher() {
  const [enabled, setEnabled] = useState(false);
  if (!enabled)
    return (
      <section className="physics-tray-spike-launcher">
        <div>
          <span>Optional feasibility proof</span>
          <strong>Real rigid-body physics</strong>
          <p>
            Loads Rapier and a larger collision tray. This is local throwaway
            code, not a proposed production dependency yet.
          </p>
        </div>
        <button type="button" onClick={() => setEnabled(true)}>
          Load physics tray spike
        </button>
      </section>
    );

  return <PhysicsTraySpike />;
}
