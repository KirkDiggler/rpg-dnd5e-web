import { MONSTER_COLOR, paletteNameForRef } from '@/author/paletteData';
import { ClassCharacterModel } from '@/components/hex-grid/ClassCharacterModel';
import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import { resolveMonsterModelUrl } from '@/components/hex-grid/monsterModels';
import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { Suspense } from 'react';
import type { RoomHexCell, RoomMonsterPlacement } from './roomDraft';

/** Authoring colors are unmistakable against the walkable green fill, the
 * cyan rectangle preview, and the amber footprint outlines: the live board's
 * monster red for actors, one distinct cyan for the party start. */
export const ROOM_MONSTER_COLOR = MONSTER_COLOR;
export const ROOM_START_COLOR = '#22d3ee';
const SELECTED_COLOR = '#fbbf24';

/** The snapped world centre of an axial cell through the SAME shared math
 * the floor paint gestures use. */
function roomActorCenter(cell: RoomHexCell) {
  return cubeToWorld({ x: cell.q, y: -cell.q - cell.r, z: cell.r }, HEX_SIZE);
}

/** One unmistakable authoring ring, plus the actor's PICK SURFACE.
 *
 * THE PICK SURFACE IS THE WHOLE CELL, AND THAT IS THE FIX. The ring alone is a
 * thin band (0.72–0.96 of a hex), and for as long as it was the marker's only
 * raycastable part, selecting a placed actor meant hitting that band exactly —
 * clicking the model or the middle of the cell, which is where anyone actually
 * aims, selected NOTHING. The panel was reachable only from the actor list's
 * Move button (Kirk, 2026-09-19).
 *
 * The pick mesh is invisible but NOT `visible={false}`: a hidden mesh is not
 * raycastable at all, which would put this straight back where it started.
 * BOTH it and the visible ring carry the same selection gesture, so clicking
 * the ring selects exactly as it always did and the rest of the cell now does
 * too. `stopPropagation` is what keeps a click on an actor from also selecting
 * the scene prop beneath it.
 *
 * The pick surface is added BEFORE the ring so the ring's colour is drawn over
 * it; both sit just above the floor. */
function ActorRing({
  actorId,
  color,
  selected,
  onSelectActor,
}: {
  actorId: string;
  color: string;
  selected: boolean;
  onSelectActor: (actorId: string) => void;
}) {
  const select = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelectActor(actorId);
  };
  return (
    <>
      <mesh
        name={`room-actor-pick-${actorId}`}
        userData={{ roomActorId: actorId }}
        position={[0, 0.04, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={select}
      >
        <circleGeometry args={[0.96, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh
        name={`room-actor-ring-${actorId}`}
        position={[0, 0.05, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={select}
      >
        <ringGeometry args={[0.72, 0.96, 6]} />
        <meshBasicMaterial
          color={selected ? SELECTED_COLOR : color}
          transparent
          opacity={selected ? 1 : 0.85}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}

/** Explicit non-model states. There is never a fallback to a different
 * monster: an unavailable ref renders a labeled chip and nothing else. */
function ActorChip({ tone, text }: { tone: string; text: string }) {
  return (
    <Html center>
      <output className={`wb-actor-chip wb-actor-chip--${tone}`}>{text}</output>
    </Html>
  );
}

/** One placed monster actor: ring, real promoted model with explicit
 * loading/error states, and a stable authoring label. An unmapped ref
 * resolves to no model at all — the explicit unavailable chip — never a
 * substitute monster. */
function MonsterMarker({
  placement,
  selected,
  onSelectActor,
}: {
  placement: RoomMonsterPlacement;
  selected: boolean;
  onSelectActor: (actorId: string) => void;
}) {
  const center = roomActorCenter(placement.cell);
  const label = paletteNameForRef(placement.ref);
  const refId = placement.ref.startsWith('dnd5e:monsters:')
    ? placement.ref.slice('dnd5e:monsters:'.length)
    : placement.ref;
  const modelUrl = resolveMonsterModelUrl(
    refId,
    undefined,
    false,
    placement.id
  );
  return (
    <group
      name={`room-monster-${placement.id}`}
      userData={{ roomActorId: placement.id, roomActorRef: placement.ref }}
      position={[center.x, DUNGEON_SURFACE_Y, center.z]}
    >
      <ActorRing
        actorId={placement.id}
        color={MONSTER_COLOR}
        selected={selected}
        onSelectActor={onSelectActor}
      />
      {modelUrl ? (
        <Suspense fallback={<ActorChip tone="loading" text={`${label}…`} />}>
          <ErrorBoundary
            fallback={
              <ActorChip tone="error" text={`${label} — model failed`} />
            }
          >
            {/* Reuse the game's skeleton-safe cloning, scale and idle pose.
                A plain scene.clone leaves skinned bodies at the source origin. */}
            <ClassCharacterModel url={modelUrl} />
          </ErrorBoundary>
        </Suspense>
      ) : (
        <ActorChip tone="unavailable" text={`${label} — model unavailable`} />
      )}
      <Html center>
        <output
          className={`wb-actor-chip wb-actor-chip--monster${
            selected ? ' wb-actor-chip--selected' : ''
          }`}
          aria-label={`Monster ${label} ${placement.id}`}
        >
          {label}
        </output>
      </Html>
    </group>
  );
}

/** The party start is a clear setup marker, distinct from every monster. */
function StartMarker({
  cell,
  selected,
  onSelectActor,
}: {
  cell: RoomHexCell;
  selected: boolean;
  onSelectActor: (actorId: string) => void;
}) {
  const center = roomActorCenter(cell);
  return (
    <group
      name="room-party-start"
      userData={{ roomActorId: 'start' }}
      position={[center.x, DUNGEON_SURFACE_Y, center.z]}
    >
      <ActorRing
        actorId="start"
        color={ROOM_START_COLOR}
        selected={selected}
        onSelectActor={onSelectActor}
      />
      <mesh
        name="room-party-start-disc"
        userData={{ roomActorId: 'start' }}
        position={[0, 0.04, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
          onSelectActor('start');
        }}
      >
        <circleGeometry args={[0.68, 6]} />
        <meshBasicMaterial
          color={ROOM_START_COLOR}
          transparent
          opacity={0.3}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <Html center>
        <output
          className={`wb-actor-chip wb-actor-chip--start${
            selected ? ' wb-actor-chip--selected' : ''
          }`}
          aria-label="Party start"
        >
          Party start
        </output>
      </Html>
    </group>
  );
}

/** The snapped hover/placement preview for an armed monster or the party
 * start tool. Purely visual: never raycastable, never authored. */
export function RoomActorPreview({
  hoverCell,
  label,
  color,
}: {
  hoverCell: RoomHexCell;
  label: string;
  color: string;
}) {
  const center = roomActorCenter(hoverCell);
  return (
    <group
      name="room-actor-preview"
      userData={{ hoverCellQ: hoverCell.q, hoverCellR: hoverCell.r }}
      position={[center.x, DUNGEON_SURFACE_Y, center.z]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[0.72, 0.96, 6]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <Html center>
        <output className="wb-actor-chip wb-actor-chip--preview">
          {label}
        </output>
      </Html>
    </group>
  );
}

/** Authoring actor markers for the authored room: placed monsters and the
 * optional party start. These are authoring metadata only — never scene
 * props, never gameplay legality. */
export function RoomActorMarkers({
  monsters,
  partyStart,
  selectedActorId,
  onSelectActor,
}: {
  monsters: readonly RoomMonsterPlacement[];
  partyStart: RoomHexCell | null;
  selectedActorId: string | null;
  onSelectActor: (actorId: string | null) => void;
}) {
  return (
    <group name="room-actor-markers">
      {monsters.map((placement) => (
        <MonsterMarker
          key={placement.id}
          placement={placement}
          selected={selectedActorId === placement.id}
          onSelectActor={onSelectActor}
        />
      ))}
      {partyStart && (
        <StartMarker
          cell={partyStart}
          selected={selectedActorId === 'start'}
          onSelectActor={onSelectActor}
        />
      )}
    </group>
  );
}
