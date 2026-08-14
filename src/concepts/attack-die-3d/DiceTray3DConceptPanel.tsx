import { useCallback, useState } from 'react';
import type {
  AttackDie3DProps,
  AttackDieTelemetry,
} from '../../components/ui/dice/AttackDie3D';
import type { DicePresentationRelease } from '../../components/ui/dice/dicePresentationRelease';
import { DiceTray3D } from '../../components/ui/dice/DiceTray3D';
import { PROVISIONAL_RESULT_10_POSE } from './attackDieExperiment';
import { DiceTrayEncounterPreview } from './DiceTrayEncounterPreview';

interface DiceTray3DConceptPanelProps {
  token: number;
  sceneOverride?: AttackDie3DProps['sceneOverride'];
  sidecarOverride?: AttackDie3DProps['sidecarOverride'];
}

export function DiceTray3DConceptPanel(props: DiceTray3DConceptPanelProps) {
  return <TokenDiceTray3DConceptPanel key={props.token} {...props} />;
}

function TokenDiceTray3DConceptPanel({
  token,
  sceneOverride,
  sidecarOverride,
}: DiceTray3DConceptPanelProps) {
  const [phase, setPhase] = useState<'armed' | 'rolling' | 'settled'>('armed');
  const [release, setRelease] = useState<DicePresentationRelease>();

  const onReleaseRequest = useCallback(
    (next: DicePresentationRelease) => {
      if (next.presentationId !== `attack:${token}`) return;
      setRelease(next);
      setPhase('rolling');
    },
    [token]
  );
  const onTelemetry = useCallback(
    (event: AttackDieTelemetry) => {
      if (
        event.state !== 'observed' ||
        event.presentationToken !== token ||
        event.requestedResult !== 10 ||
        !event.exactTargetHeld
      )
        return;
      setPhase((current) => (current === 'rolling' ? 'settled' : current));
    },
    [token]
  );
  const status =
    phase === 'armed'
      ? 'Result 10 only · waiting for your roll'
      : phase === 'rolling'
        ? 'Result 10 released · waiting for observation'
        : 'Result 10 observed · roll settled';

  return (
    <section className="dice-tray-3d-concept-panel">
      <header>
        <h3>Gameplay placement checkpoint</h3>
        <p>{status}</p>
      </header>
      <DiceTrayEncounterPreview
        tray={
          <DiceTray3D
            label="Player attack dice"
            rollerRole="player"
            witnessRole="roller"
            phase={phase}
            release={release}
            onReleaseRequest={onReleaseRequest}
            onTelemetry={onTelemetry}
            dice={[
              {
                id: 'attack',
                kind: 'd20',
                presetId: 'lightning',
                authoritativeResult: 10,
                presentationToken: token,
              },
            ]}
            reducedMotion
            sceneOverride={sceneOverride}
            sidecarOverride={sidecarOverride}
            calibrationPose={PROVISIONAL_RESULT_10_POSE}
          />
        }
      />
    </section>
  );
}
