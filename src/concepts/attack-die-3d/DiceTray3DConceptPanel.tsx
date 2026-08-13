import type { AttackDie3DProps } from '../../components/ui/dice/AttackDie3D';
import { DiceTray3D } from '../../components/ui/dice/DiceTray3D';
import { PROVISIONAL_RESULT_10_POSE } from './attackDieExperiment';
import { DiceTrayEncounterPreview } from './DiceTrayEncounterPreview';

interface DiceTray3DConceptPanelProps {
  token: number;
  sceneOverride?: AttackDie3DProps['sceneOverride'];
  sidecarOverride?: AttackDie3DProps['sidecarOverride'];
}

export function DiceTray3DConceptPanel({
  token,
  sceneOverride,
  sidecarOverride,
}: DiceTray3DConceptPanelProps) {
  return (
    <section className="dice-tray-3d-concept-panel">
      <header>
        <h3>Gameplay placement checkpoint</h3>
        <p>Result 10 only · no interaction yet</p>
      </header>
      <DiceTrayEncounterPreview
        tray={
          <DiceTray3D
            label="Player attack dice"
            phase="settled"
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
