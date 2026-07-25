import { useCallback, useEffect, useState } from 'react';
import {
  DiceTray,
  type DiceTrayPhase,
} from '../../components/ui/dice/DiceTray';

export function JustRollConcept() {
  const [open, setOpen] = useState(false);
  const [face, setFace] = useState(20);
  const [phase, setPhase] = useState<DiceTrayPhase>('hidden');
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (phase !== 'entering') return;
    const timer = setTimeout(() => setPhase('rolling'), 180);
    return () => clearTimeout(timer);
  }, [phase]);

  const settle = useCallback(() => setPhase('settled'), []);

  const roll = () => {
    setFace(Math.floor(Math.random() * 20) + 1);
    setPhase(open ? 'rolling' : 'entering');
    setOpen(true);
  };

  return (
    <div className="just-roll-concept">
      <p>Local, non-authoritative play</p>
      <div className="just-roll-concept__controls">
        <button className="just-roll-concept__button" onClick={roll}>
          {open ? 'Roll again' : 'Roll local d20'}
        </button>
        <button
          className="just-roll-concept__button"
          onClick={() => setReducedMotion((value) => !value)}
        >
          Reduced motion: {reducedMotion ? 'on' : 'off'}
        </button>
      </div>
      {open && (
        <DiceTray
          phase={phase}
          finalFace={face}
          outcome="LOCAL"
          reducedMotion={reducedMotion}
          onPresentationComplete={settle}
          className="just-roll-concept__tray"
        >
          {phase === 'settled' && <div role="status">Local result: {face}</div>}
          <button
            className="just-roll-concept__dismiss"
            onClick={() => setOpen(false)}
          >
            Dismiss
          </button>
        </DiceTray>
      )}
    </div>
  );
}
