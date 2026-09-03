/**
 * SessionCanvas — the actual Three.js scene for the session route, split
 * out of `SessionEncounterView.tsx` so that file's data-orchestration
 * (fetch atlas/position/character, gate on layout, show loading/error
 * states) can be unit-tested without a WebGL canvas (jsdom can't provide
 * one — same reasoning `EncounterMap.test.tsx`'s own doc comment gives for
 * stubbing `HexGrid`). This component is the thing that gets stubbed
 * there.
 *
 * `SessionScene` (the part that actually needs the R3F context — it calls
 * `useCameraControls`, which needs `useThree`) is exported separately so
 * `SessionCanvas.test.tsx` can render it directly through
 * `@react-three/test-renderer`, the same way `SyntyHexWall.test.tsx`
 * renders `SyntyHexWall` directly rather than nesting a second `<Canvas>`
 * inside the test renderer's own root.
 *
 * # Armed server candidates on the map
 *
 * `attackableTargets` contains only available candidates from the exact Attack
 * declaration the player armed in the panel. With no armed declaration it is
 * empty: a direct map click never chooses or dispatches an action. Candidates
 * receive the existing quiet ring and brighter hover ring; unavailable
 * candidates remain visible as entities but receive no ring and cannot route a
 * dispatch. Floor walking and occupied-cell behavior are otherwise unchanged.
 *
 * BOTH the ground-plane raycast AND each entity's OWN mesh route through
 * the SAME resolution, for click AND hover alike — `HexEntity` has its
 * own `onClick`/`onPointerOver`/`onPointerOut` (wired here to
 * `handleTargetClick`/`setMeshHoveredSubject`, unlike the old `HexGrid`
 * route's per-entity selection flow) specifically because its model
 * geometry sits in front of the invisible ground plane along the same
 * ray the ground plane's own raycast uses, and — caught live, TWICE —
 * neither a click NOR a hover on that geometry ever reached the ground
 * plane behind it on its own: `HexEntity`'s own `handleClick`
 * unconditionally calls `event.stopPropagation()`, and R3F simply never
 * fires a synthetic pointer event on an object BEHIND the nearest
 * intersected one, handler-or-not, for hover any more than for click.
 * Without a handler wired here for BOTH event types, a click landing on
 * a model was a no-op and a hover over one never resolved to "you're
 * looking at this entity" at all — the affordance only ever worked over
 * bare floor beside the model. `effectiveHoveredHex` prefers the
 * entity's own KNOWN position while the mesh reports it hovered (no
 * raycast intersection point needed — the position is already known),
 * falling back to the ground plane's own hit otherwise.
 */

import { CAMERA_OFFSET } from '@/rendering/calibrationConstants';
import type { HairCustomization } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import type {
  DoorInfo,
  PublicMemberInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { MemberKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { Canvas } from '@react-three/fiber';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import { readCameraDials } from '../hex-grid/cameraDials';
import { HexEntity } from '../hex-grid/HexEntity';
import { coordToKey, cubeToWorld, type CubeCoord } from '../hex-grid/hexMath';
import type { MainHandPresentation } from '../hex-grid/mainHandPresentation';
import type { OffHandPresentation } from '../hex-grid/offHandEquipment';
import { PathPreview } from '../hex-grid/PathPreview';
import { useCameraControls } from '../hex-grid/useCameraControls';
import { useHexInteraction } from '../hex-grid/useHexInteraction';
import type { AtlasPathIndex } from './atlasPath';
import type { Scene3D } from './atlasToScene3D';
import { DungeonEnvironment } from './DungeonEnvironment';
import { MoveIndicator } from './MoveIndicator';
import { isSightedDowned, type SightedMember } from './sightingEntities';
import { useMoveIndicator } from './useMoveIndicator';

/** Matches `HexGrid.tsx`'s own invisible ground plane — big enough to
 * cover any dungeon this route draws; only its raycast target, never
 * rendered. */
const GROUND_PLANE_SIZE = 200;

/** The passive, persistent in-reach ring — the SAME hue `MoveIndicator`'s
 * own `'target'` kind uses for the hover state, at a much quieter
 * opacity so it reads as "you can hit this" without competing with the
 * model itself. Kirk's own ruling: "leaves the model readable... hover
 * state can add a little more, the passive in-reach state should be
 * quiet." */
const ATTACKABLE_RING_COLOR = '#f97316';
// `PathPreview` treats a single-cell path's one cell as its own
// "destination" and multiplies the opacity it's given by 1.5x (its own
// per-path emphasis rule, designed for a multi-cell walk preview) — this
// is the BASE value so the rendered ring lands at the intended ~0.22.
const ATTACKABLE_RING_OPACITY = 0.15;

/**
 * The model-resolving id inside an authored monster ref —
 * "dnd5e:monsters:skeleton" -> "skeleton", the vocabulary
 * `resolveMonsterModelUrl` already speaks (rpg-project#264: the roster's
 * authored ref replaces deriving this by stripping the subject's ordinal;
 * the derivation survives only as the missing-entry fallback above).
 * `undefined` in, or a ref with no segments, is `undefined` out.
 */
function monsterRefIdFrom(monsterRef: string | undefined): string | undefined {
  if (!monsterRef) return undefined;
  const segment = monsterRef.split(':').pop();
  return segment || undefined;
}

export interface SessionCanvasProps {
  scene: Scene3D;
  hexSize: number;
  characterId: string;
  /** Public roster identity; never owner-private CharacterData. */
  characterName: string;
  /** Public roster body ref; private CharacterData does not choose models. */
  classRefId: string | undefined;
  /** Public roster race ref; private CharacterData does not choose models. */
  raceRefId?: string;
  /** Owner-private GetCharacterData Appearance.hair. Peer hair never enters
   * through this prop; it remains on each public roster row. */
  localHair?: HairCustomization;
  /** Public turn-participant standing for the local player; never derived from
   * owner-private HP state. */
  localIsDowned?: boolean;
  /** Owner-authoritative equipped main-hand presentation for the local player.
   * Never applied to `otherMembers`, whose equipment is not public today. */
  mainHandPresentation?: MainHandPresentation;
  /** Owner-authoritative reviewed off-hand presentation for the local player.
   * Never applied to peers. */
  offHandPresentation?: OffHandPresentation;
  myPosition: CubeCoord;
  /** The local player's real hex-by-hex route for the CURRENT `moveSeq`
   * (`MoveResponse.steps`, already bridged to cube coords) — passed
   * straight through to `HexEntity.movePath`. `undefined` when no walk
   * has happened yet this mount. */
  movePath?: CubeCoord[];
  /** Bumped once per genuine walk — passed straight through to
   * `HexEntity.moveSeq`, which is what actually triggers the animation
   * (see `useHexMovePath.ts`). */
  moveSeq?: number;
  /** Fires when a floor hex is clicked (and it isn't an attack — see this
   * component's own doc comment) — the request-shaping/pathfinding and
   * the `Move` RPC itself live in the caller (`useSessionWalk`), not
   * here; this component only owns the raycast. */
  onHexClick?: (coord: CubeCoord) => void;
  /** Fires when a click lands on an `attackableTargets` entity's cell —
   * see this component's own doc comment. `onHexClick` is NOT also
   * called in that case. */
  onEntityClick?: (subject: string) => void;
  /** Fires with the subject under the cursor, or `null` — presentation
   * only (drives the panel's "Attack <name>" hover label); this
   * component makes no affordability judgment of its own. */
  onHoverEntity?: (subject: string | null) => void;
  /** Fires once the local player's walk ANIMATION finishes painting
   * `movePath` for the given `moveSeq` — presentation-only, matches
   * `HexEntity`'s own `onMovementPresentationComplete` contract (entityId
   * dropped here since this route only ever animates the local player). */
  onMovementPresentationComplete?: (moveSeq: number) => void;
  /** Every OTHER member the local player currently perceives
   * (`GetView.sightings`, mapped by `sightingsToEntities`). Drawn as a
   * player or monster `HexEntity` per `member.kind` (rpg-dnd5e-web#792 —
   * see this component's render below for the split), with no
   * `movePath`/`moveSeq` of their own either way: `useHexMovePath` already
   * snaps an entity straight to a new `position` when `moveSeq` never
   * advances, so a `GetView` refetch that moves one of these simply
   * relocates it on the next render. Undefined/empty draws nothing
   * extra. */
  otherMembers?: readonly SightedMember[];
  /** The session roster keyed by member id (`useSessionRoster` —
   * rpg-project#264): the PUBLIC identity each sighted member renders
   * with. A missing map (fetch failed, not landed yet) or a missing
   * entry degrades every lookup below to the pre-roster behavior —
   * neutral placeholder for players, subject-derived ref for monsters —
   * never a blocked render. */
  roster?: ReadonlyMap<string, PublicMemberInfo>;
  /** Live door state keyed by door id (`useSessionDoors` —
   * rpg-project#268): drives the leaf each doorway renders. Missing map
   * or entry falls back to a shut leaf — the pre-doors look. */
  doors?: ReadonlyMap<string, DoorInfo>;
  /** Fires with the clicked door's id — the open/unlock affordance lives
   * in the caller, which knows who acts and what the door's state is. */
  onDoorClick?: (door: string) => void;
  /** Subject ids the caller currently offers as in-reach, AFFORDABLE
   * Attack candidates (rpg-project#249) — see this component's own doc
   * comment on why this is narrower than every in-reach candidate.
   * Undefined/empty means nothing is attackable right now. */
  attackableTargets?: string[];
  /** The atlas's movement graph (`atlasPath.ts`'s `buildAtlasPathIndex`) —
   * the SAME index `useSessionWalk` builds its `MoveRequest` path from.
   * Feeds the hover/path indicator via `useMoveIndicator`. `undefined`/
   * `null` simply means nothing is drawn under the cursor yet
   * (`moveIndicator.ts`'s own doc comment). `SessionEncounterView` pins
   * this to the last successfully-loaded atlas rather than passing a
   * live one straight through, so in practice this is only ever null
   * before the FIRST atlas load. */
  pathIndex?: AtlasPathIndex | null;
  /** Not this member's turn — non-attackable hover shows the locked state.
   * Defaults to `false`. */
  turnLocked?: boolean;
  /** Feet of movement left this turn, from the MOVE declaration's
   * `remaining`. Shades the hover path's over-budget tail; it never
   * shortens the path or blocks the click (`moveIndicator.ts`'s own doc
   * comment). `undefined` outside a turn, or whenever no single MOVE
   * declaration reports a budget — the whole path then reads affordable,
   * which is the pre-budget behavior. */
  movementBudgetFeet?: number;
  /** Optional presentation-only R3F layer. Concepts use this to prove
   * temporary world-space effects without teaching SessionCanvas game rules. */
  presentationLayer?: ReactNode;
}

/** Renders inside the Canvas — `useCameraControls` needs the R3F context
 * (`useThree`), so it cannot run in the component that owns `<Canvas>`
 * itself. */
export function SessionScene({
  hexSize,
  scene,
  characterId,
  characterName,
  classRefId,
  raceRefId,
  localHair,
  mainHandPresentation,
  offHandPresentation,
  localIsDowned = false,
  myPosition,
  movePath,
  moveSeq,
  onHexClick,
  onEntityClick,
  onHoverEntity,
  onMovementPresentationComplete,
  otherMembers,
  roster,
  doors,
  onDoorClick,
  attackableTargets,
  pathIndex = null,
  turnLocked = false,
  movementBudgetFeet,
  presentationLayer,
}: SessionCanvasProps) {
  // Stable base target, seeded ONCE from the character's starting position
  // and frozen after that (HexGrid.tsx's own `initialTargetRef` pattern —
  // see its doc comment). `useCameraControls` mutates this same object in
  // place as the player pans (WASD/right-drag), and its own effects
  // re-initialize whenever the TARGET REFERENCE changes — a fresh
  // `new THREE.Vector3(...)` built inline on every render (Copilot review,
  // PR #764) would snap the camera back to the character on any unrelated
  // re-render, silently discarding whatever the player just panned to.
  const target = cubeToWorld(myPosition, hexSize);
  const initialTargetRef = useRef<THREE.Vector3 | null>(null);
  if (initialTargetRef.current === null) {
    initialTargetRef.current = new THREE.Vector3(target.x, 0, target.z);
  }

  // Slice 2: the camera now CONTINUOUSLY follows the local player
  // (`focusTarget`, HexGrid.tsx's own pattern — `useCameraControls` lerps
  // its target toward this whenever the reference changes, and a manual
  // pan clears it) instead of the slice-1 frozen seed alone, so a walk
  // across the tomb stays in frame rather than leaving the character to
  // exit-stage as they cross into another room.
  const focusTarget = useMemo(
    () => new THREE.Vector3(target.x, 0, target.z),
    [target.x, target.z]
  );
  const cameraDials = useMemo(() => readCameraDials(), []);
  useCameraControls({
    target: initialTargetRef.current,
    focusTarget,
    panSpeed: cameraDials.panSpeed,
    rotateSpeed: cameraDials.rotateSpeed,
    orbitPivot: cameraDials.orbitPivot,
    minZoom: cameraDials.zoomMin,
    maxZoom: cameraDials.zoomMax,
    curve: cameraDials.curve,
    perspective: cameraDials.perspective,
    minDistance: cameraDials.minDistance,
    maxDistance: cameraDials.maxDistance,
  });

  const attackableSet = useMemo(
    () => new Set(attackableTargets ?? []),
    [attackableTargets]
  );

  // The ONE place a target click is resolved — both the ground plane's
  // own fallback (a click that lands on an entity's cell without going
  // through the entity's own mesh, e.g. a remembered/inert entity with no
  // handlers of its own) and each live entity's `HexEntity.onClick` call
  // this directly. See this module's own doc comment on why the entity
  // mesh needs its own wired handler at all.
  const handleTargetClick = useCallback(
    (subject: string) => {
      if (attackableSet.has(subject)) onEntityClick?.(subject);
    },
    [attackableSet, onEntityClick]
  );

  // Click-to-walk: the raycast/hover/validity machinery is the SAME
  // ground-plane convention `HexGrid`'s own `useHexInteraction` already
  // established (worldToCube, floor-membership gating) — reused rather
  // than re-derived. In practice a click that lands on a LIVE entity's
  // cell is caught by that entity's own `onClick` (wired below) before
  // it ever reaches the ground plane at all; this `hit` check remains as
  // the fallback for an entity with no handlers of its own (remembered/
  // inert — see `HexEntity`'s own `interactionProps`), so its cell still
  // never falls through to a walk attempt.
  const handleGroundClick = useCallback(
    (coord: CubeCoord) => {
      const key = coordToKey(coord);
      const hit = otherMembers?.find(
        (member) => coordToKey(member.position) === key
      );
      if (hit) {
        handleTargetClick(hit.subject);
        return;
      }
      onHexClick?.(coord);
    },
    [otherMembers, handleTargetClick, onHexClick]
  );

  const { groundPlaneProps, hoveredHex } = useHexInteraction({
    hexSize,
    floorTiles: scene.floorTiles,
    onHexClick: handleGroundClick,
  });

  // Which subject the pointer is directly over, reported by the entity's
  // OWN mesh (`HexEntity.onPointerOver`/`onPointerOut`, wired below) —
  // Kirk's own live-walk finding: the ground plane's `onPointerMove`
  // never resolves while the cursor is over a model sitting in front of
  // it along the same ray (the exact reason `onClick` needed the same
  // fix), so the hex-based lookup below alone only ever caught a hover on
  // bare floor, never the model itself.
  const [meshHoveredSubject, setMeshHoveredSubject] = useState<string | null>(
    null
  );

  // Clears the sticky mesh-hover the moment the subject it names STOPS
  // being an attack target it PREVIOUSLY was one -- the fight ending
  // (attackableTargets -> undefined) is the case caught live
  // (rpg-project#251 web#771: "the path looks like it continues from the
  // downed skeleton"), and a target dying/dropping out of reach mid-fight
  // is the same shape one level narrower. Necessary because `onPointerOut`
  // alone cannot be trusted to fire here: a downed/dead entity's mesh
  // typically swaps to a different pose/geometry that no longer occupies
  // the same screen space the standing pose did, so the pointer never
  // technically "leaves" a mesh that's already gone -- see this module's
  // own effectiveHoveredHex doc comment above for why a stale subject
  // then pins the WHOLE indicator (path origin included) to that entity's
  // last-known cell regardless of where the floor is hovered next.
  //
  // Deliberately keyed on "was attackable, now isn't" rather than "isn't
  // currently attackable" -- the latter would ALSO fire for a plain
  // free-roam hover (attackableTargets never defined at all, e.g. no
  // fight in progress), which must keep reporting via onHoverEntity
  // exactly as it always has. `prevAttackableRef` is this hook's only
  // memory of "was" across renders.
  const prevAttackableRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const wasAttackable = prevAttackableRef.current.has(
      meshHoveredSubject ?? ''
    );
    const stillAttackable = meshHoveredSubject
      ? (attackableTargets?.includes(meshHoveredSubject) ?? false)
      : false;
    if (meshHoveredSubject && wasAttackable && !stillAttackable) {
      setMeshHoveredSubject(null);
    }
    prevAttackableRef.current = new Set(attackableTargets ?? []);
  }, [attackableTargets, meshHoveredSubject]);

  // The EFFECTIVE hovered cell for both the indicator's rendering
  // position and the entity lookup below: the entity's own known
  // position while the pointer is over its mesh (no raycast needed — we
  // already know exactly which cell it occupies), falling back to the
  // ground plane's own raycast hit otherwise.
  const effectiveHoveredHex = useMemo(() => {
    if (meshHoveredSubject) {
      return (
        otherMembers?.find((m) => m.subject === meshHoveredSubject)?.position ??
        hoveredHex
      );
    }
    return hoveredHex;
  }, [meshHoveredSubject, otherMembers, hoveredHex]);

  // Which OTHER member, if any, sits under the hovered cell — the mesh's
  // own report wins outright when present; otherwise the SAME geometric
  // lookup this module has always used (cheap — otherMembers is small).
  const hoveredEntityId = useMemo(() => {
    if (meshHoveredSubject) return meshHoveredSubject;
    if (!hoveredHex || !otherMembers) return null;
    const key = coordToKey(hoveredHex);
    return (
      otherMembers.find((m) => coordToKey(m.position) === key)?.subject ?? null
    );
  }, [meshHoveredSubject, hoveredHex, otherMembers]);

  // Presentation-only: report the hovered subject up so the panel can
  // show "Attack <name>" (or its shortfall) — this component makes no
  // affordability judgment of its own. Only fires on an actual change so
  // a caller's state setter doesn't churn every render.
  const lastReportedHoverRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastReportedHoverRef.current === hoveredEntityId) return;
    lastReportedHoverRef.current = hoveredEntityId;
    onHoverEntity?.(hoveredEntityId);
  }, [hoveredEntityId, onHoverEntity]);

  const moveIndicatorSelection = useMoveIndicator({
    hovered: effectiveHoveredHex,
    from: myPosition,
    pathIndex,
    locked: turnLocked,
    hoveredEntityId,
    attackable: hoveredEntityId ? attackableSet.has(hoveredEntityId) : false,
    budgetFeet: movementBudgetFeet,
  });

  // The passive, persistent in-reach rings — every attackable target's
  // own cell, at the quiet opacity (see this module's own doc comment).
  // The hovered one additionally gets `MoveIndicator`'s own brighter
  // 'target' ring on top (rendered separately below), which is the
  // "hover can add a little more" Kirk asked for — no extra state needed
  // here, the two simply layer.
  const attackableRingPositions = useMemo(
    () =>
      (otherMembers ?? []).filter(
        (m) => !m.remembered && attackableSet.has(m.subject)
      ),
    [otherMembers, attackableSet]
  );

  return (
    <>
      <DungeonEnvironment
        scene={scene}
        focus={{ x: target.x, z: target.z }}
        hexSize={hexSize}
        doors={doors}
        onDoorClick={onDoorClick}
      />
      {/* Invisible ground plane for hit detection — HexGrid.tsx's own
          convention, unchanged. */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        {...groundPlaneProps}
      >
        <planeGeometry args={[GROUND_PLANE_SIZE, GROUND_PLANE_SIZE]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {presentationLayer}
      {attackableRingPositions.map((member) => (
        <PathPreview
          key={`attackable-ring-${member.subject}`}
          path={[member.position]}
          hexSize={hexSize}
          color={ATTACKABLE_RING_COLOR}
          opacity={ATTACKABLE_RING_OPACITY}
        />
      ))}
      <MoveIndicator
        selection={moveIndicatorSelection}
        hexSize={hexSize}
        hovered={effectiveHoveredHex}
      />
      <HexEntity
        entityId={characterId}
        name={characterName}
        position={myPosition}
        type="player"
        hexSize={hexSize}
        classRefId={classRefId}
        raceRefId={raceRefId}
        hairCustomization={localHair}
        isDowned={localIsDowned}
        mainHandPresentation={mainHandPresentation}
        offHandPresentation={offHandPresentation}
        movePath={movePath}
        moveSeq={moveSeq}
        onMovementPresentationComplete={(_entityId, completedMoveSeq) =>
          onMovementPresentationComplete?.(completedMoveSeq)
        }
      />
      {otherMembers?.map((member) => (
        // rpg-dnd5e-web#792: a PLAYER-kind sighting routes to HexEntity's
        // player path — same path the local player renders through below,
        // just with no `character`/`classRefId` of its own (sighted
        // players carry neither; GetCharacterData is owner-gated per
        // rpg-api#814, so this component never fetches another player's
        // sheet). HexEntity's own class-model resolution already treats a
        // missing classRefId as "no class GLB mapped" and falls back to
        // its MediumHumanoid placeholder in the NEUTRAL 'human' variant —
        // the same degrade-to-known-placeholder rule #479 already
        // established for an unmapped class, reused here for a genuinely
        // absent one. Everything else (MONSTER, and UNSPECIFIED per
        // `SightedMember.kind`'s own doc comment) keeps the monster path,
        // `monsterRefId` included — `sightingEntities.ts` already leaves
        // that field undefined for a PLAYER subject, so passing it through
        // unconditionally is safe for both branches.
        <HexEntity
          key={member.subject}
          entityId={member.subject}
          name={member.name}
          position={member.position}
          type={member.kind === MemberKind.PLAYER ? 'player' : 'monster'}
          hexSize={hexSize}
          classRefId={
            member.kind === MemberKind.PLAYER
              ? roster?.get(member.subject)?.classRef
              : undefined
          }
          raceRefId={
            member.kind === MemberKind.PLAYER
              ? roster?.get(member.subject)?.raceRef || undefined
              : undefined
          }
          hairCustomization={
            member.kind === MemberKind.PLAYER
              ? roster?.get(member.subject)?.customization?.hair
              : undefined
          }
          monsterRefId={
            monsterRefIdFrom(roster?.get(member.subject)?.monsterRef) ??
            member.monsterRefId
          }
          knowledgeState={member.remembered ? 'remembered' : undefined}
          isDowned={
            member.kind === MemberKind.PLAYER &&
            isSightedDowned(member.standing)
          }
          isDead={
            member.kind !== MemberKind.PLAYER &&
            isSightedDowned(member.standing)
          }
          onClick={handleTargetClick}
          onPointerOver={setMeshHoveredSubject}
          onPointerOut={() => setMeshHoveredSubject(null)}
        />
      ))}
    </>
  );
}

/**
 * The Canvas wrapper. Orthographic isometric camera at the same
 * `CAMERA_OFFSET` and shared zoom/pitch treatment as `HexGrid`, so the session
 * route keeps the approved tabletop planning view when pulled out and flattens
 * toward the minis when zoomed in. `useCameraControls`
 * (WASD/Q-E/wheel/right-drag) takes over placement from there.
 */
export function SessionCanvas(props: SessionCanvasProps) {
  const cameraDials = useMemo(() => readCameraDials(), []);
  return (
    <Canvas
      key={cameraDials.perspective ? 'persp' : 'ortho'}
      orthographic={!cameraDials.perspective}
      frameloop="demand"
      camera={{
        position: CAMERA_OFFSET,
        near: 0.1,
        far: 1000,
        ...(cameraDials.perspective
          ? { fov: cameraDials.fovDeg }
          : { zoom: cameraDials.zoomStart }),
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <SessionScene {...props} />
    </Canvas>
  );
}
