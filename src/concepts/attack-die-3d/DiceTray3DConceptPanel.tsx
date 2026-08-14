import { useCallback, useState } from 'react';
import type { AttackDie3DProps } from '../../components/ui/dice/AttackDie3D';
import type {
  DicePresentationEvent,
  DicePresentationReleasedEvent,
  DicePresentationRequestedEvent,
} from '../../components/ui/dice/dicePresentationEvent';
import {
  DiceTrayPresentation,
  type DiceTrayPresentationDevelopmentRenderer,
} from '../../components/ui/dice/DiceTrayPresentation';
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

function createFixtureRequest(token: number): DicePresentationRequestedEvent {
  const presentationId = `concept:attack:${token}`;
  return Object.freeze({
    schemaVersion: 1,
    type: 'dice-presentation-requested',
    eventId: `concept:request:${token}`,
    presentationId,
    roller: Object.freeze({ entityId: 'concept:player', role: 'player' }),
    die: Object.freeze({
      kind: 'd20',
      presetId: 'lightning',
      authoritativeResult: 10,
    }),
  });
}

function TokenDiceTray3DConceptPanel({
  token,
  sceneOverride,
  sidecarOverride,
}: DiceTray3DConceptPanelProps) {
  const [events, setEvents] = useState<readonly DicePresentationEvent[]>(() =>
    Object.freeze([createFixtureRequest(token)])
  );
  const appendRequestedRelease = useCallback(
    (next: DicePresentationReleasedEvent) => {
      if (next.presentationId !== `concept:attack:${token}`) return;
      setEvents((current) => {
        if (
          current.some(
            (event) =>
              event.type === 'dice-presentation-released' &&
              event.presentationId === next.presentationId
          )
        )
          return current;
        return Object.freeze([...current, next]);
      });
    },
    [token]
  );
  const developmentOnlyRenderer:
    | DiceTrayPresentationDevelopmentRenderer
    | undefined =
    sceneOverride && sidecarOverride
      ? {
          scene: sceneOverride,
          sidecar: sidecarOverride,
          calibrationPose: PROVISIONAL_RESULT_10_POSE,
        }
      : undefined;

  return (
    <section className="dice-tray-3d-concept-panel">
      <header>
        <h3>Gameplay placement checkpoint</h3>
        <p>Shared event-fed presentation · fixed result 10</p>
      </header>
      <DiceTrayEncounterPreview
        tray={
          <DiceTrayPresentation
            label="Player attack dice"
            events={events}
            witnessRole="roller"
            onReleaseRequest={appendRequestedRelease}
            reducedMotion={false}
            developmentOnlyRenderer={developmentOnlyRenderer}
          />
        }
      />
    </section>
  );
}
