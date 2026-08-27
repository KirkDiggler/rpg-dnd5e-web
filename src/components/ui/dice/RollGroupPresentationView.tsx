import type { DiceRollGroupRequestedEvent } from './diceRollGroupEvent';
import type { RollGroupFeelProfile } from './rollGroupMotionSolver';
import { RollGroupNarration } from './RollGroupNarration';
import type { RollGroupDieAppearance } from './RollGroupPresentation';
import type { RerollBatch } from './rollGroupPresentationModel';
import { statusText } from './rollGroupPresentationModel';
import type { RollGroupPresentationState } from './rollGroupPresentationState';
import { RollGroupTray3D, type RollGroupTray3DProps } from './RollGroupTray3D';
import { SemanticRollGroup } from './SemanticRollGroup';
import type { VisualThrowProfileV1 } from './visualThrowProfile';

export interface RollGroupPresentationViewProps {
  readonly label: string;
  readonly request: DiceRollGroupRequestedEvent;
  readonly witnessRole: 'roller' | 'spectator';
  readonly rendererGeneration: number;
  readonly boundaryMounted: boolean;
  readonly fallback: boolean;
  readonly state: RollGroupPresentationState;
  readonly semanticState: RollGroupPresentationState;
  readonly batch?: RerollBatch;
  readonly rerollBatches: readonly RerollBatch[];
  readonly faces: Readonly<Record<string, number>>;
  readonly semanticFaces: Readonly<Record<string, number>>;
  readonly releaseProfile?: VisualThrowProfileV1;
  readonly feel: RollGroupFeelProfile;
  readonly appearances: readonly RollGroupDieAppearance[];
  readonly visibleModifierCount: number;
  readonly releaseAuthority: boolean;
  readonly onReleaseRequest: (profile?: VisualThrowProfileV1) => void;
  readonly onOriginalsSettled: () => void;
  readonly onRerollSettled: () => void;
  readonly onFinalFrameRendered: () => void;
  readonly onReady: NonNullable<RollGroupTray3DProps['onReady']>;
  readonly onFailure: NonNullable<RollGroupTray3DProps['onFailure']>;
  readonly onAttachmentDiagnostic: NonNullable<
    RollGroupTray3DProps['onAttachmentDiagnostic']
  >;
  readonly reducedMotion: boolean;
  readonly forceFailure?: RollGroupTray3DProps['forceFailure'];
  readonly motionSeed: number;
}

export function RollGroupPresentationView({
  label,
  request,
  witnessRole,
  rendererGeneration,
  boundaryMounted,
  fallback,
  state,
  semanticState,
  batch,
  rerollBatches,
  faces,
  semanticFaces,
  releaseProfile,
  feel,
  appearances,
  visibleModifierCount,
  releaseAuthority,
  onReleaseRequest,
  onOriginalsSettled,
  onRerollSettled,
  onFinalFrameRendered,
  onReady,
  onFailure,
  onAttachmentDiagnostic,
  reducedMotion,
  forceFailure,
  motionSeed,
}: RollGroupPresentationViewProps) {
  const visibleModifiers = [...request.group.modifiers]
    .sort((first, second) => first.order - second.order)
    .slice(0, visibleModifierCount);
  return (
    <section
      data-testid="roll-group-presentation"
      data-witness-role={witnessRole}
      data-renderer-generation={rendererGeneration}
      aria-label={label}
    >
      <p data-testid="roll-group-phase-status">
        {statusText(label, semanticState, batch, fallback)}
      </p>
      <RollGroupNarration
        presentationId={request.presentationId}
        witnessRole={witnessRole}
        rendererGeneration={rendererGeneration}
        group={request.group}
        state={semanticState}
        rerollBatches={rerollBatches}
        appearances={appearances}
        visibleModifierCount={visibleModifierCount}
      />
      {boundaryMounted ? (
        fallback ? (
          <SemanticRollGroup
            group={request.group}
            presentation={semanticState}
            presentationToken={rendererGeneration}
            activeRerollBatch={batch}
            displayedFaces={semanticFaces}
            onReleaseRequest={
              releaseAuthority ? () => onReleaseRequest() : undefined
            }
            renderDice3D={false}
          />
        ) : (
          <RollGroupTray3D
            label={label}
            presentationId={request.presentationId}
            rendererGeneration={rendererGeneration}
            motionSeed={motionSeed}
            rollerRole={request.roller.role}
            witnessRole={witnessRole}
            phase={state.phase}
            group={request.group}
            feel={feel}
            appearances={appearances}
            displayedFaces={faces}
            rerollDieIds={batch?.dieIds}
            rerollOccurrenceKey={batch?.occurrenceKey}
            throwProfile={releaseProfile}
            onReleaseRequest={onReleaseRequest}
            onOriginalsSettled={onOriginalsSettled}
            onRerollSettled={onRerollSettled}
            onFinalFrameRendered={onFinalFrameRendered}
            onReady={onReady}
            onFailure={onFailure}
            onAttachmentDiagnostic={onAttachmentDiagnostic}
            reducedMotion={reducedMotion}
            forceFailure={forceFailure}
          />
        )
      ) : null}
      {!fallback && visibleModifiers.length > 0 ? (
        <ul aria-label="Roll modifiers">
          {visibleModifiers.map((modifier) => (
            <li key={modifier.id}>
              <span>{modifier.displayLabel}</span>:{' '}
              {'value' in modifier ? modifier.value : modifier.text}
            </li>
          ))}
        </ul>
      ) : null}
      {semanticState.phase === 'complete' &&
      request.group.suppliedFinalTotal !== undefined ? (
        <span aria-label="Final total" data-testid="roll-group-total">
          {String(request.group.suppliedFinalTotal)}
        </span>
      ) : null}
    </section>
  );
}
