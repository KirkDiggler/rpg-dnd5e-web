import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import { WORLD_BUILDING_CATALOG_BY_REF } from '@/concepts/world-building/catalog';
import type { WorldProp } from '@/concepts/world-building/types';
import { WorkspaceFloorSurface } from '@/concepts/world-building/WorkspaceFloorUnderlay';
import { WorldPropModel } from '@/concepts/world-building/WorldPropModel';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { Suspense } from 'react';
import type { RoomScenePresentation } from './roomSceneJson';
import { useDungeonShellCatalog } from './useDungeonShellCatalog';

export interface RoomSceneEnvironmentProps {
  readonly presentation: RoomScenePresentation;
}

/**
 * RoomSceneEnvironment — the one visual body of a canonical room
 * presentation. Every piece renders through the shared World Building
 * leaves the authoring editor itself uses (`WorldPropModel`, the
 * workspace Crypt floor), at the presentation's own already-world-posed
 * coordinates and continuous yaw — `HEX_SIZE 1` game units in, game
 * units out, no feet conversion and no second group transform.
 *
 * What is deliberately NOT here:
 * - the atlas's duplicated legacy cell props, shell walls, per-cell
 *   floor and any authoring guides (composition bounds, anchor ring,
 *   paint tint) — the canonical branch suppresses all of them;
 * - actors: monster/start markers do not belong in a presentation, and
 *   real actors are member-scoped session state rendered above this
 *   component (`SessionCanvas`'s roster/sightings path);
 * - lights: `DungeonEnvironment` projects the canonical scene's own
 *   point lights exactly once; nothing here resolves them again.
 *
 * Loading and failure are always NAMED. A catalog entry or asset that
 * has not loaded yet shows a named loading marker; a failed one shows a
 * named error marker. No failure ever swaps in a substitute model, and
 * the workspace floor is never silently lost — its load/error states are
 * explicit meshes.
 */

/** A named, obviously-not-an-asset placeholder for one item's load/error
 * state, sitting where the item itself would stand. */
function RoomSceneAssetMarker({
  itemId,
  assetRef,
  tone,
  position,
}: {
  itemId: string;
  assetRef: string;
  tone: 'loading' | 'error';
  position: [number, number, number];
}) {
  return (
    <mesh
      name={`room-scene-item-${tone}-${itemId}`}
      userData={{ itemId, assetRef, status: tone }}
      position={[
        position[0],
        position[1] + DUNGEON_SURFACE_Y + 0.3,
        position[2],
      ]}
      raycast={() => null}
    >
      <boxGeometry args={[0.5, 0.6, 0.5]} />
      <meshStandardMaterial
        color={tone === 'loading' ? '#eab308' : '#ef4444'}
        wireframe
      />
    </mesh>
  );
}

function RoomSceneItem({ item }: { item: WorldProp }) {
  const entry = WORLD_BUILDING_CATALOG_BY_REF.get(item.assetRef);
  // The decoder's scene validation refuses refs outside the catalog, so
  // a miss here is defensive only — and it stays a named error, never a
  // substitute model.
  if (!entry) {
    return (
      <RoomSceneAssetMarker
        itemId={item.id}
        assetRef={item.assetRef}
        tone="error"
        position={[item.transform.x, item.transform.y, item.transform.z]}
      />
    );
  }
  // THE SOURCE POSE, VERBATIM. Same convention as WorldPropVisual: the
  // shared leaves add the one rendered-prop surface lift internally;
  // heightScale stays a visual-only Y scale. `parentId`/`supportId` are
  // authoring relations — group and support poses are already baked into
  // these already-world-posed transforms and are NOT applied again.
  const position: [number, number, number] = [
    item.transform.x,
    item.transform.y,
    item.transform.z,
  ];
  return (
    <group
      name={`room-scene-item-${item.id}`}
      userData={{ worldItemId: item.id, assetRef: item.assetRef }}
    >
      <Suspense
        fallback={
          <RoomSceneAssetMarker
            itemId={item.id}
            assetRef={item.assetRef}
            tone="loading"
            position={position}
          />
        }
      >
        <ErrorBoundary
          fallback={
            <RoomSceneAssetMarker
              itemId={item.id}
              assetRef={item.assetRef}
              tone="error"
              position={position}
            />
          }
        >
          <WorldPropModel
            entry={entry}
            position={position}
            rotationY={item.transform.rotationY}
            heightScale={item.heightScale}
          />
        </ErrorBoundary>
      </Suspense>
    </group>
  );
}

/** Named stand-in while the Crypt floor texture loads or has failed, in
 * the exact geometry position the real surface would occupy. */
function RoomSceneFloorMarker({
  tone,
  radius,
}: {
  tone: 'loading' | 'error';
  radius: number;
}) {
  return (
    <mesh
      name={`room-scene-floor-${tone}`}
      userData={{ status: tone }}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, DUNGEON_SURFACE_Y - 0.006, 0]}
      raycast={() => null}
    >
      <circleGeometry args={[radius, 6]} />
      <meshBasicMaterial color={tone === 'loading' ? '#2b3238' : '#5f1d1d'} />
    </mesh>
  );
}

/** The whole authored workspace floor — the same Crypt geometry/UV
 * contract the editor presents (`WorkspaceFloorSurface`), at the
 * authoring radius `horizontalLimit + 1`. Catalog or texture trouble is
 * reported by name, never by quietly dropping the floor. */
function RoomSceneFloor({ radius }: { radius: number }) {
  const shellCatalog = useDungeonShellCatalog();
  if (shellCatalog.status !== 'ready') {
    return (
      <RoomSceneFloorMarker
        tone={shellCatalog.status === 'failed' ? 'error' : 'loading'}
        radius={radius}
      />
    );
  }
  return (
    <Suspense
      fallback={<RoomSceneFloorMarker tone="loading" radius={radius} />}
    >
      <ErrorBoundary
        fallback={<RoomSceneFloorMarker tone="error" radius={radius} />}
      >
        <WorkspaceFloorSurface
          radius={radius}
          profile={shellCatalog.catalog.profiles.crypt.floor}
        />
      </ErrorBoundary>
    </Suspense>
  );
}

export function RoomSceneEnvironment({
  presentation,
}: RoomSceneEnvironmentProps) {
  return (
    <>
      <RoomSceneFloor radius={presentation.workspace.horizontalLimit + 1} />
      {presentation.scene.items.map((item) => (
        <RoomSceneItem key={item.id} item={item} />
      ))}
    </>
  );
}
