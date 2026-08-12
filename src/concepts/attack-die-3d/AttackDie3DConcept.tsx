import { useState } from 'react';
import { AttackDie3D } from '../../components/ui/dice/AttackDie3D';
import { DiceTray } from '../../components/ui/dice/DiceTray';
const stages = ['Appearance', 'Calibrate', 'Roll', 'Verify'] as const;
export function AttackDie3DConcept() {
  const [stage, setStage] = useState(0);
  const [token, setToken] = useState(1);
  return (
    <section className="attack-die-concept">
      <header>
        <p className="attack-die-concept__eyebrow">
          Development concept · production-intent renderer
        </p>
        <h2>Authoritative 3D Attack Die</h2>
        <p>
          The SVG remains semantic truth while this staged lab proves
          appearance, calibration, roll, and verification contracts.
        </p>
      </header>
      <div
        role="tablist"
        aria-label="Attack die stages"
        className="attack-die-concept__tabs"
      >
        {stages.map((name, index) => (
          <button
            key={name}
            role="tab"
            aria-selected={stage === index}
            tabIndex={stage === index ? 0 : -1}
            onClick={() => setStage(index)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setStage((index + 1) % stages.length);
              if (e.key === 'ArrowLeft')
                setStage((index + stages.length - 1) % stages.length);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        aria-label={stages[stage]}
        className="attack-die-concept__stage"
      >
        <div>
          <h3>{stages[stage]}</h3>
          <p>
            {stage === 0
              ? 'Compare raw and magical treatment.'
              : stage === 1
                ? 'Prepare explicit 1–20 calibration without inferred poses.'
                : stage === 2
                  ? 'Replay the same authoritative fixture through decorative paths.'
                  : 'Inspect the fixed-order all-face evidence workflow.'}
          </p>
          <button onClick={() => setToken((x) => x + 1)}>Replay fixture</button>
        </div>
        <AttackDie3D
          result={20}
          presentationToken={token}
          phase="rolling"
          materialMode="magical"
          reducedMotion={false}
          fallback={<DiceTray phase="settled" finalFace={20} outcome="CRIT" />}
        />
      </div>
    </section>
  );
}
