import { useEffect, useMemo, useReducer, useState } from 'react';
import type { AttackDie3DProps } from '../../components/ui/dice/AttackDie3D';
import type { DicePresentationEvent } from '../../components/ui/dice/dicePresentationEvent';
import {
  DiceTrayPresentation,
  type DiceTrayPresentationDevelopmentRenderer,
} from '../../components/ui/dice/DiceTrayPresentation';
import { PROVISIONAL_RESULT_10_POSE } from './attackDieExperiment';
import { DiceTrayEncounterPreview } from './DiceTrayEncounterPreview';
import {
  appendDiceTrayWitnessEvent,
  createDiceTrayWitnessInitialEvents,
  scheduleMonsterDiceTrayWitnessRelease,
  type DiceTrayWitnessMode,
} from './diceTrayWitnessFixture';

interface DiceTray3DConceptPanelProps {
  token: number;
  reducedMotion: boolean;
  sceneOverride?: AttackDie3DProps['sceneOverride'];
  sidecarOverride?: AttackDie3DProps['sidecarOverride'];
}

export function DiceTray3DConceptPanel(props: DiceTray3DConceptPanelProps) {
  return <TokenDiceTray3DConceptPanel key={props.token} {...props} />;
}

function TokenDiceTray3DConceptPanel({
  token,
  reducedMotion,
  sceneOverride,
  sidecarOverride,
}: DiceTray3DConceptPanelProps) {
  const [mode, setMode] = useState<DiceTrayWitnessMode>('player');

  return (
    <section className="dice-tray-3d-concept-panel">
      <header>
        <h3>Gameplay placement checkpoint</h3>
        <p>
          Fixture event delivery · shared component contract · no production
          transport
        </p>
        <fieldset
          className="dice-tray-3d-concept-panel__modes"
          aria-label="Dice witness roller mode"
        >
          <legend>Roller mode</legend>
          {(['player', 'monster'] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="dice-tray-witness-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {value === 'player' ? 'Player' : 'Monster'}
            </label>
          ))}
        </fieldset>
      </header>
      <DiceTrayWitnessDeliveryHost
        key={`${token}:${mode}`}
        token={token}
        mode={mode}
        reducedMotion={reducedMotion}
        sceneOverride={sceneOverride}
        sidecarOverride={sidecarOverride}
      />
    </section>
  );
}

interface DiceTrayWitnessDeliveryHostProps extends DiceTray3DConceptPanelProps {
  mode: DiceTrayWitnessMode;
}

function DiceTrayWitnessDeliveryHost({
  token,
  mode,
  reducedMotion,
  sceneOverride,
  sidecarOverride,
}: DiceTrayWitnessDeliveryHostProps) {
  const [events, append] = useReducer(
    (
      current: readonly DicePresentationEvent[],
      input: unknown
    ): readonly DicePresentationEvent[] =>
      appendDiceTrayWitnessEvent(current, input),
    createDiceTrayWitnessInitialEvents(token, mode)
  );

  useEffect(() => {
    if (mode !== 'monster') return;
    return scheduleMonsterDiceTrayWitnessRelease(token, append);
  }, [append, mode, token]);

  const developmentOnlyRenderer = useMemo<
    DiceTrayPresentationDevelopmentRenderer | undefined
  >(
    () =>
      sceneOverride && sidecarOverride
        ? {
            scene: sceneOverride,
            sidecar: sidecarOverride,
            calibrationPose: PROVISIONAL_RESULT_10_POSE,
          }
        : undefined,
    [sceneOverride, sidecarOverride]
  );

  return (
    <DiceTrayEncounterPreview
      trays={[
        {
          label: 'Roller',
          content: (
            <DiceTrayPresentation
              label="Roller attack dice"
              events={events}
              witnessRole="roller"
              onReleaseRequest={mode === 'player' ? append : undefined}
              reducedMotion={reducedMotion}
              developmentOnlyRenderer={developmentOnlyRenderer}
            />
          ),
        },
        {
          label: 'Spectator',
          content: (
            <DiceTrayPresentation
              label="Spectator attack dice"
              events={events}
              witnessRole="spectator"
              reducedMotion={reducedMotion}
              developmentOnlyRenderer={developmentOnlyRenderer}
            />
          ),
        },
      ]}
    />
  );
}
