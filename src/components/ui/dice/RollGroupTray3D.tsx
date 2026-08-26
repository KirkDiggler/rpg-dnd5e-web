import { Canvas } from '@react-three/fiber';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Camera, Scene, WebGLRenderer } from 'three';
import type { AnchoredHeldRollGroupState } from './anchoredRollGroupGestureController';
import type { DiceRollGroupDie } from './diceRollGroup';
import type { DiceTrayInteractionHitRegion } from './DiceTrayInteractionSurface';
import { DiceTrayInteractionSurface } from './DiceTrayInteractionSurface';
import type { ClientBounds } from './rollGroupGestureController';
import { projectRollGroupHitTarget } from './rollGroupHitTarget';
import { layoutHeldRollGroup, layoutRestingRollGroup } from './rollGroupLayout';
import {
  ROLL_GROUP_FEEL_PROFILES,
  type RollGroupFeelProfile,
} from './rollGroupMotionSolver';
import type { RollGroupDieAppearance } from './RollGroupPresentation';
import { RollGroupRenderBoundary } from './RollGroupRenderBoundary';
import { installRollGroupRendererGuard } from './rollGroupRendererGuard';
import {
  RollGroupRuntimeMember,
  type ActiveRuntimeSurfaceGrab,
  type RollGroupTrayPhase,
  type RuntimeMemberSurfaceHandle,
} from './RollGroupRuntimeMember';
import {
  configureRollGroupTrayCamera,
  ROLL_GROUP_HELD_PLANE_HEIGHT,
  ROLL_GROUP_HELD_PLANE_WIDTH,
  ROLL_GROUP_TRAY_CAMERA,
} from './rollGroupTrayGeometry';
import type { TrayPlaneProjection } from './trayPlaneProjection';
import { TrayPlaneProjectionBridge } from './TrayPlaneProjectionBridge';
import {
  createNeutralVisualThrowProfile,
  type VisualThrowProfileV1,
} from './visualThrowProfile';
import { canCreateWebGLContext } from './webglAvailability';

export interface RollGroupTray3DProps {
  readonly label: string;
  readonly presentationId: string;
  readonly rendererGeneration: number;
  readonly motionSeed: number;
  readonly rollerRole: 'player' | 'monster';
  readonly witnessRole: 'roller' | 'spectator';
  readonly phase: RollGroupTrayPhase;
  readonly group: {
    readonly key: 'attack' | 'damage';
    readonly dice: readonly DiceRollGroupDie[];
  };
  readonly feel: RollGroupFeelProfile;
  readonly appearances: readonly RollGroupDieAppearance[];
  readonly displayedFaces?: Readonly<Record<string, number>>;
  readonly rerollDieIds?: readonly string[];
  readonly rerollOccurrenceKey?: string;
  readonly throwProfile?: VisualThrowProfileV1;
  readonly onReleaseRequest?: (profile?: VisualThrowProfileV1) => void;
  readonly onOriginalsSettled?: () => void;
  readonly onRerollSettled?: () => void;
  readonly onFinalFrameRendered?: () => void;
  readonly onReady?: (
    input: Readonly<{
      dieId: string;
      runtimeSourceId: number;
      runtimeCloneId: number;
    }>
  ) => void;
  readonly onFailure?: (dieId: string, reason: string) => void;
  readonly onAttachmentDiagnostic?: (
    diagnostic: Readonly<{
      readonly presentationId: string;
      readonly rendererGeneration: number;
      readonly dieId: string;
      readonly projectedAnchor: readonly [number, number];
      readonly heldPoseApplied: boolean;
      readonly frameSequence: number;
    }>
  ) => void;
  readonly reducedMotion?: boolean;
  readonly forceFailure?: 'provider' | 'webgl' | 'solver';
}

const NEUTRAL_PROFILE = createNeutralVisualThrowProfile(0);
const EMPTY_REROLL_DIE_IDS: readonly string[] = Object.freeze([]);

function snapshotBounds(element: HTMLElement): ClientBounds | undefined {
  try {
    const rect = element.getBoundingClientRect();
    const bounds = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    return Object.values(bounds).every(Number.isFinite) &&
      bounds.width > 0 &&
      bounds.height > 0
      ? bounds
      : undefined;
  } catch {
    return undefined;
  }
}

function displayedFaceFor(
  die: DiceRollGroupDie,
  phase: RollGroupTrayPhase,
  displayedFaces: Readonly<Record<string, number>> | undefined
) {
  return (
    displayedFaces?.[die.id] ??
    (phase === 'modifiers' || phase === 'complete'
      ? die.finalFace
      : die.originalFace)
  );
}

export function RollGroupTray3D({
  label,
  presentationId,
  rendererGeneration,
  motionSeed,
  rollerRole,
  witnessRole,
  phase,
  group,
  feel,
  appearances,
  displayedFaces,
  rerollDieIds = EMPTY_REROLL_DIE_IDS,
  rerollOccurrenceKey,
  throwProfile = NEUTRAL_PROFILE,
  onReleaseRequest,
  onOriginalsSettled,
  onRerollSettled,
  onFinalFrameRendered,
  onReady,
  onFailure,
  onAttachmentDiagnostic,
  reducedMotion = false,
  forceFailure,
}: RollGroupTray3DProps) {
  const heldRef = useRef<AnchoredHeldRollGroupState | undefined>(undefined);
  const projectionRef = useRef<TrayPlaneProjection | undefined>(undefined);
  const [projection, setProjection] = useState<TrayPlaneProjection>();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [overlayBounds, setOverlayBounds] = useState<ClientBounds>();
  const reportedFailure = useRef(false);
  const targetFrameIds = useRef(new Set<string>());
  const targetFrameReported = useRef(false);
  const targetRefs = useRef(
    new Map<string, HTMLButtonElement | HTMLDivElement>()
  );
  const surfaceHandlesRef = useRef(
    new Map<string, RuntimeMemberSurfaceHandle>()
  );
  const activeSurfaceGrabRef = useRef<ActiveRuntimeSurfaceGrab | undefined>(
    undefined
  );
  const rendererGuardRef = useRef<
    ReturnType<typeof installRollGroupRendererGuard> | undefined
  >(undefined);
  const webglAvailable = useMemo(canCreateWebGLContext, [
    presentationId,
    rendererGeneration,
  ]);
  const heldLayout = useMemo(
    () => layoutHeldRollGroup(group.dice),
    [group.dice]
  );
  const restingLayout = useMemo(
    () => layoutRestingRollGroup(group.dice, motionSeed),
    [group.dice, motionSeed]
  );
  const restingLayoutById = useMemo(
    () => new Map(restingLayout.map((item) => [item.dieId, item] as const)),
    [restingLayout]
  );
  const heldLayoutById = useMemo(
    () => new Map(heldLayout.map((item) => [item.dieId, item] as const)),
    [heldLayout]
  );
  const usesHeldLayout = phase === 'armed' || phase === 'held';
  const interactionLayout = usesHeldLayout ? heldLayout : restingLayout;
  const interactionLayoutById = usesHeldLayout
    ? heldLayoutById
    : restingLayoutById;
  const canvasEventSource =
    typeof document === 'undefined' ? undefined : document.body;
  const rerollDieIdSet = useMemo(() => new Set(rerollDieIds), [rerollDieIds]);
  const diceIdentity = group.dice.map((die) => die.id).join('|');
  const faceIdentity = group.dice
    .map((die) => displayedFaceFor(die, phase, displayedFaces))
    .join('|');
  const rerollIdentity = rerollDieIds.join('|');
  const canInteract =
    phase === 'armed' &&
    rollerRole === 'player' &&
    witnessRole === 'roller' &&
    onReleaseRequest !== undefined;

  const reportFailure = useCallback(
    (dieId: string, reason: string) => {
      if (reportedFailure.current) return;
      reportedFailure.current = true;
      onFailure?.(dieId, reason);
    },
    [onFailure]
  );

  useEffect(() => {
    if (!webglAvailable)
      reportFailure(
        group.dice[0]?.id ?? 'group',
        'WebGL creation failed: unavailable context'
      );
  }, [group.dice, reportFailure, webglAvailable]);

  useEffect(() => {
    if (forceFailure)
      reportFailure(group.dice[0]?.id ?? 'group', `${forceFailure} failure`);
  }, [forceFailure, group.dice, reportFailure]);

  useEffect(
    () => () => {
      rendererGuardRef.current?.dispose();
      rendererGuardRef.current = undefined;
      activeSurfaceGrabRef.current = undefined;
      surfaceHandlesRef.current.clear();
    },
    []
  );

  useEffect(() => {
    targetFrameIds.current = new Set();
    targetFrameReported.current = false;
  }, [
    diceIdentity,
    faceIdentity,
    phase,
    presentationId,
    rendererGeneration,
    rerollIdentity,
    rerollOccurrenceKey,
  ]);

  useLayoutEffect(() => {
    if (!overlayRef.current) return;
    setOverlayBounds(snapshotBounds(overlayRef.current));
  }, [projection, interactionLayout]);

  const handleTargetFrame = useCallback(
    (
      dieId: string,
      witnessedPhase: 'rolling-originals' | 'rerolling' | 'complete'
    ) => {
      if (
        witnessedPhase !== phase ||
        targetFrameReported.current ||
        !group.dice.some((die) => die.id === dieId)
      )
        return;
      targetFrameIds.current.add(dieId);
      if (targetFrameIds.current.size !== group.dice.length) return;
      targetFrameReported.current = true;
      if (witnessedPhase === 'rolling-originals') onOriginalsSettled?.();
      else if (witnessedPhase === 'rerolling') onRerollSettled?.();
      else onFinalFrameRendered?.();
    },
    [
      group.dice,
      onFinalFrameRendered,
      onOriginalsSettled,
      onRerollSettled,
      phase,
    ]
  );

  const getHitRegions = useCallback(
    (): readonly DiceTrayInteractionHitRegion[] =>
      group.dice.flatMap((die, index) => {
        const target = targetRefs.current.get(die.id);
        const layout = interactionLayoutById.get(die.id);
        if (!target || !layout) return [];
        const bounds = snapshotBounds(target);
        return bounds
          ? [
              {
                dieId: die.id,
                bounds,
                memberAnchor: layout.center,
                stableIndex: index,
              },
            ]
          : [];
      }),
    [group.dice, interactionLayoutById]
  );

  const heldChange = useCallback((held: unknown) => {
    heldRef.current =
      held &&
      typeof held === 'object' &&
      'grabbedDieId' in held &&
      typeof held.grabbedDieId === 'string'
        ? (held as AnchoredHeldRollGroupState)
        : undefined;
    if (!heldRef.current) activeSurfaceGrabRef.current = undefined;
  }, []);
  const captureSurface = useCallback(
    (dieId: string, clientX: number, clientY: number) => {
      const grab = surfaceHandlesRef.current
        .get(dieId)
        ?.captureSurface({ clientX, clientY });
      activeSurfaceGrabRef.current = grab
        ? { dieId, rendererGeneration, grab }
        : undefined;
    },
    [rendererGeneration]
  );
  const requestNeutralRelease = useCallback(() => {
    onReleaseRequest?.(createNeutralVisualThrowProfile(motionSeed));
  }, [motionSeed, onReleaseRequest]);
  const handleCanvasCreated = useCallback(
    ({
      gl,
      scene,
      camera,
    }: {
      gl: WebGLRenderer;
      scene: Scene;
      camera: Camera;
    }) => {
      try {
        configureRollGroupTrayCamera(camera);
        rendererGuardRef.current?.dispose();
        rendererGuardRef.current = installRollGroupRendererGuard(
          gl,
          scene,
          camera,
          (reason) => reportFailure(group.dice[0]?.id ?? 'group', reason)
        );
      } catch (error) {
        reportFailure(
          group.dice[0]?.id ?? 'group',
          `WebGL renderer setup failed: ${
            error instanceof Error ? error.message : 'unknown'
          }`
        );
      }
    },
    [group.dice, reportFailure]
  );

  return (
    <section
      aria-label={label}
      data-testid="roll-group-tray-3d"
      data-phase={phase}
      data-witness-role={witnessRole}
      className="dice-tray-3d-shell dice-tray-3d-shell--compact roll-group-tray-3d"
    >
      <DiceTrayInteractionSurface
        mode="tray-plane"
        canInteract={canInteract}
        motionSeed={motionSeed}
        projection={projection}
        getHitRegions={getHitRegions}
        onHeldChange={heldChange}
        onReleaseRequest={onReleaseRequest}
        className="dice-tray-3d-renderer roll-group-tray-3d__surface"
        testId="roll-group-tray-surface"
      >
        {webglAvailable ? (
          <RollGroupRenderBoundary
            onError={(reason) =>
              reportFailure(group.dice[0]?.id ?? 'group', reason)
            }
          >
            <Canvas
              aria-hidden="true"
              className="roll-group-tray-3d__canvas"
              eventSource={canvasEventSource}
              camera={{
                fov: ROLL_GROUP_TRAY_CAMERA.fov,
                near: ROLL_GROUP_TRAY_CAMERA.near,
                far: ROLL_GROUP_TRAY_CAMERA.far,
                position: [...ROLL_GROUP_TRAY_CAMERA.position],
                up: [...ROLL_GROUP_TRAY_CAMERA.up],
              }}
              onCreated={handleCanvasCreated}
            >
              <ambientLight intensity={1.4} />
              <directionalLight position={[0.7, 1.7, 0.7]} intensity={2.1} />
              <TrayPlaneProjectionBridge
                origin={[0, 0, 0]}
                xAxis={[1, 0, 0]}
                yAxis={[0, 0, 1]}
                width={ROLL_GROUP_HELD_PLANE_WIDTH}
                height={ROLL_GROUP_HELD_PLANE_HEIGHT}
                projectionRef={projectionRef}
                onProjection={setProjection}
              />
              {group.dice.map((die, index) => (
                <RollGroupRuntimeMember
                  key={die.id}
                  die={die}
                  displayedFace={displayedFaceFor(die, phase, displayedFaces)}
                  affectedByCurrentReroll={rerollDieIdSet.has(die.id)}
                  rerollOccurrenceKey={rerollOccurrenceKey}
                  index={index}
                  memberCount={group.dice.length}
                  phase={phase}
                  feel={feel}
                  projection={projection}
                  reducedMotion={reducedMotion}
                  throwProfile={throwProfile}
                  heldRef={heldRef}
                  heldLayout={heldLayoutById.get(die.id) ?? heldLayout[0]}
                  restingLayout={
                    restingLayoutById.get(die.id) ?? restingLayout[0]
                  }
                  appearance={appearances.find(
                    (appearance) => appearance.dieId === die.id
                  )}
                  reportFailure={reportFailure}
                  onReady={onReady}
                  onTargetFrame={handleTargetFrame}
                  onAttachmentDiagnostic={onAttachmentDiagnostic}
                  presentationId={presentationId}
                  rendererGeneration={rendererGeneration}
                  surfaceHandlesRef={surfaceHandlesRef}
                  activeSurfaceGrabRef={activeSurfaceGrabRef}
                />
              ))}
            </Canvas>
          </RollGroupRenderBoundary>
        ) : null}
        <div
          ref={overlayRef}
          className="roll-group-tray-3d__targets"
          aria-hidden={!canInteract}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            pointerEvents: 'none',
          }}
        >
          {group.dice.map((die) => {
            const layout =
              interactionLayoutById.get(die.id) ?? interactionLayout[0];
            const common = {
              ref: (element: HTMLButtonElement | HTMLDivElement | null) => {
                if (element) targetRefs.current.set(die.id, element);
                else targetRefs.current.delete(die.id);
              },
              style: {
                ...projectRollGroupHitTarget(layout, projection, overlayBounds),
                pointerEvents: canInteract
                  ? ('auto' as const)
                  : ('none' as const),
                cursor: canInteract ? ('grab' as const) : undefined,
              },
              onPointerDown: (event: React.PointerEvent) =>
                captureSurface(die.id, event.clientX, event.clientY),
              'data-roll-group-die-id': die.id,
              'data-renderer-generation': rendererGeneration,
              'data-witness-role': witnessRole,
            } as const;
            return canInteract ? (
              <button
                key={die.id}
                type="button"
                aria-label={`Grab ${die.kind}`}
                {...common}
              />
            ) : (
              <div key={die.id} {...common} />
            );
          })}
        </div>
        {canInteract ? (
          <button
            type="button"
            aria-label="Roll dice"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={requestNeutralRelease}
          >
            Roll dice
          </button>
        ) : null}
      </DiceTrayInteractionSurface>
    </section>
  );
}

export { ROLL_GROUP_FEEL_PROFILES };
