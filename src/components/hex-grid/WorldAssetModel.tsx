import {
  resolveWorldAsset,
  type GeneratedWorldAsset,
  type WorldAssetResolutionDiagnostic,
} from '@/generated/worldAssetCatalog';
import {
  assembleAssetHeightInstance,
  expandPartBindings,
  expandPartSelections,
  legacyAssetHeightProfile,
} from '@/rendering/assetHeightInstance';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { clipWallSection } from '@/rendering/clipWallSection';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import {
  applyOriginalHeightUvs,
  captureOriginalHeightUvs,
} from '@/rendering/originalHeightUvs';
import {
  fitPlainWallInstance,
  type PlainWallFit,
} from '@/rendering/plainWallFit';
import { propVisualScale } from '@/rendering/propVisualScale';
import type { RegionLightingMaterialBinding } from '@/rendering/regionLightingMaterials';
import { useWorldMaterialCatalog } from '@/rendering/useWorldMaterialCatalog';
import {
  applyWallSurfaceCharts,
  type WallSurfaceChart,
} from '@/rendering/wallSurfaceCharts';
import {
  resolveWorldAtlasMaterials,
  type ResolvedWorldAtlasMaterials,
} from '@/rendering/worldAtlasCatalog';
import type { WorldAtlasMaterialsInput } from '@/rendering/worldAtlasMaterials';
import type { WorldSurfaceAsset } from '@/rendering/worldMaterialCatalog';
import type {
  MaterialOverride,
  WorldSurfaceMaterial,
} from '@/rendering/worldMaterialTypes';
import {
  createWorldSurfaceSampler,
  resolveWorldSurfaceTargets,
  type WorldSurfaceSelection,
} from '@/rendering/worldSurfaceMaterials';
import { useGLTF } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { PropModelBounds } from './PropModel';
import { useRememberedModelTint } from './useRememberedModelTint';

export type WorldAssetRole = NonNullable<
  GeneratedWorldAsset['roles']
>[number]['role'];

/** One declared opening: the asset-local id and its leaf pivot in asset space. */
import {
  fitWallOpeningInstance,
  type WallOpeningDescriptor,
  type WallOpeningFit,
} from '@/rendering/wallOpeningFit';

export interface WorldAssetDoor {
  id: string;
  /** Leaf pivot in the asset's local frame; the placement transform is the consumer's. */
  position: [number, number, number];
}

export interface WorldAssetRoleDiagnostic {
  ref: string;
  reason: 'missing-role-node';
  role: WorldAssetRole;
  node: string;
}

export type WorldAssetModelDiagnostic =
  | WorldAssetResolutionDiagnostic
  | WorldAssetRoleDiagnostic;

export interface WorldAssetModelProps {
  /** A promoted exact ref. Family refs and unknown exact refs never fall back. */
  assetRef: string;
  materialOverrides?: readonly MaterialOverride[];
  position: [number, number, number];
  rotationY?: number;
  onBoundsMeasured?: (bounds: PropModelBounds) => void;
  onDiagnostic?: (diagnostic: WorldAssetModelDiagnostic) => void;
  heightScale?: number;
  /** Absolute rendered height; structural callers do not scale the parent Y. */
  targetHeight?: number;
  remembered?: boolean;
  /** The remembered multiply tint (default `REMEMBERED_TINT`). */
  rememberedTint?: THREE.Color;
  visualLighting?: RegionLightingMaterialBinding;
  /** Visual-only fitting for an explicitly enrolled plain wall body. */
  plainWallFit?: PlainWallFit;
  /** Measured surround fit; aperture anchor for doors, body anchor for static sections. */
  wallOpeningFit?: WallOpeningFit;
  /** Transient, fully loaded finish sets for explicit provider surface bindings.
   * The caller supplies a fitted compatible chart; no persisted room state here. */
  surfaceSelections?: readonly WorldSurfaceSelection[];
  surfacePlans?: readonly {
    material: WorldSurfaceMaterial;
    chart: WallSurfaceChart;
  }[];
  surfaceProvider?: WorldSurfaceAsset;
  /** Asset-local door ids rendered OPEN: every `leaf` in the group swings about its own hinge. */
  openDoors?: readonly string[];
  /** Every declared group is open. The coarser form for a caller holding ONE
   * door's live state: a placed door item is one door however many openings
   * its asset declares, and the caller is not the one that resolved them. */
  open?: boolean;
  /** Unknown mutable state hides only moving leaves, retaining known fixed art. */
  hideDoorLeaves?: boolean;
  /** Fires when the door was hit. The raycast is the whole assembly, so a
   * click on the frame, a leaf or the cap above all report the door — the
   * affordance belongs to the door, not to one of its parts. */
  onDoorClick?: () => void;
  /** Called once per instance with every declared door group and its leaf pivot. */
  onDoorsResolved?: (doors: readonly WorldAssetDoor[]) => void;
}

interface ResolvedLeaf {
  node: THREE.Object3D;
  restQuaternion: THREE.Quaternion;
  restVisible: boolean;
}

interface ResolvedDoor {
  id: string;
  position: [number, number, number];
  leaves: ResolvedLeaf[];
}

interface ResolvedRoles {
  doors: ResolvedDoor[];
}

interface MissingRoleNode {
  role: WorldAssetRole;
  node: string;
}

const OPEN_ANGLE = Math.PI / 2;

/** Bounding box of a node's geometry expressed in its parent's frame. */
function parentFrameBounds(node: THREE.Object3D): THREE.Box3 {
  const parent = node.parent;
  if (!parent) return new THREE.Box3().setFromObject(node);
  parent.updateWorldMatrix(true, false);
  const toParent = parent.matrixWorld.clone().invert();
  const world = new THREE.Box3().setFromObject(node);
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (const x of [world.min.x, world.max.x]) {
    for (const y of [world.min.y, world.max.y]) {
      for (const z of [world.min.z, world.max.z]) {
        box.expandByPoint(corner.set(x, y, z).applyMatrix4(toParent));
      }
    }
  }
  return box;
}

/**
 * Derive a leaf's hinge axis from its own hierarchy: the panel's thinnest
 * dimension is its normal, and the hinge is the remaining principal axis the
 * pivot does not sit on as a boundary — or the longer one when the pivot sits
 * at a corner (an upright door's hinge edge meets the floor there). This is
 * what lets a horizontal-hinged asset (drawbridge) swing without a new role.
 */
function deriveHingeAxis(
  node: THREE.Object3D,
  parent: THREE.Object3D
): THREE.Vector3 {
  const box = parentFrameBounds(node);
  const size = box.getSize(new THREE.Vector3());
  parent.updateWorldMatrix(true, false);
  const pivot = node
    .getWorldPosition(new THREE.Vector3())
    .applyMatrix4(parent.matrixWorld.clone().invert());
  const dimensions = [size.x, size.y, size.z];
  const thin = dimensions.reduce(
    (best, value, index) => (value < dimensions[best]! ? index : best),
    0
  );
  const principal = [0, 1, 2].filter((axis) => axis !== thin);
  // Authored trim can protrude a few millimetres past the hinge line, so a
  // small fraction of the panel's thinnest dimension also counts as on-edge.
  const epsilon = Math.max(
    size.length() * 1e-4,
    0.02 * Math.min(...dimensions)
  );
  const onBoundary = (axis: number) =>
    pivot.getComponent(axis) - box.min.getComponent(axis) <= epsilon ||
    box.max.getComponent(axis) - pivot.getComponent(axis) <= epsilon;
  const interior = principal.filter((axis) => !onBoundary(axis));
  const chosen =
    interior.length === 1
      ? interior[0]!
      : principal.reduce(
          (best, axis) =>
            dimensions[axis]! >= dimensions[best]! ? axis : best,
          principal[0]!
        );
  return new THREE.Vector3().setComponent(chosen, 1);
}

/**
 * Bind declared role names to the loaded hierarchy. Never falls back: a
 * declared node that is absent is reported by asset, role, and node.
 */
function resolveRoles(
  root: THREE.Object3D,
  roles: NonNullable<GeneratedWorldAsset['roles']>
): ResolvedRoles | MissingRoleNode {
  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const doors = new Map<
    string,
    { position: THREE.Vector3; leaves: ResolvedLeaf[] }
  >();
  for (const binding of roles) {
    const node = root.getObjectByName(binding.node);
    if (!node) return { role: binding.role, node: binding.node };
    if (binding.role === 'above') continue;
    if (binding.role === 'leaf' && binding.door) {
      const group = doors.get(binding.door) ?? {
        position: new THREE.Vector3(),
        leaves: [],
      };
      if (group.leaves.length === 0) {
        group.position.copy(
          node.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseRoot)
        );
      }
      group.leaves.push({
        node,
        restQuaternion: node.quaternion.clone(),
        restVisible: node.visible,
      });
      doors.set(binding.door, group);
    }
    // `frame` is static by contract: binding it only proves the node exists.
  }
  return {
    doors: [...doors.entries()].map(([id, group]) => ({
      id,
      position: group.position.toArray() as [number, number, number],
      leaves: group.leaves,
    })),
  };
}

/**
 * Swing every leaf of a group about its own derived hinge, restoring the
 * authored rest pose first so repeated renders are idempotent. Directions
 * alternate along the leaves' hinge spread, which is what a split pair needs;
 * the doorway binding owns whether a group is a door and which way it faces.
 */
function applyLeafSwing(leaves: ResolvedLeaf[], open: boolean) {
  const ordered = [...leaves].sort(
    (left, right) => left.node.position.x - right.node.position.x
  );
  const signs = new Map(
    ordered.map((leaf, index) => [leaf, index % 2 === 0 ? 1 : -1])
  );
  for (const leaf of leaves) {
    leaf.node.quaternion.copy(leaf.restQuaternion);
    if (!open) continue;
    const parent = leaf.node.parent;
    if (!parent) continue;
    parent.updateWorldMatrix(true, true);
    const parentQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
    const hingeInParent = deriveHingeAxis(leaf.node, parent);
    const localAxis = hingeInParent
      .clone()
      .applyQuaternion(parentQuaternion.invert())
      .normalize();
    leaf.node.quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(
        localAxis,
        (signs.get(leaf) ?? 1) * OPEN_ANGLE
      )
    );
  }
}

function LoadedWorldAssetModel({
  assetRef,
  glbSha256,
  url,
  boundsMeters,
  roles,
  heightFit,
  position,
  rotationY,
  onBoundsMeasured,
  onDiagnostic,
  onDoorsResolved,
  openDoors,
  open,
  hideDoorLeaves,
  onDoorClick,
  heightScale,
  targetHeight,
  remembered,
  rememberedTint,
  visualLighting,
  plainWallFit,
  openingDescriptor,
  surfaces,
  surfaceSelections,
  surfaceCharts,
  atlasTreatment,
}: {
  assetRef: string;
  glbSha256: string;
  materialOverrides?: readonly MaterialOverride[];
  atlasTreatment?: Pick<
    WorldAtlasMaterialsInput,
    'glbSha256' | 'binding' | 'selections'
  >;
  url: string;
  boundsMeters: [number, number, number];
  roles: NonNullable<GeneratedWorldAsset['roles']> | undefined;
  heightFit?: GeneratedWorldAsset['heightFit'];
  position: [number, number, number];
  rotationY: number;
  onBoundsMeasured?: (bounds: PropModelBounds) => void;
  onDiagnostic?: (diagnostic: WorldAssetModelDiagnostic) => void;
  onDoorsResolved?: (doors: readonly WorldAssetDoor[]) => void;
  openDoors: readonly string[];
  open?: boolean;
  hideDoorLeaves?: boolean;
  onDoorClick?: () => void;
  heightScale: number;
  targetHeight?: number;
  remembered: boolean;
  rememberedTint?: THREE.Color;
  visualLighting?: RegionLightingMaterialBinding;
  plainWallFit?: PlainWallFit;
  openingDescriptor?: WallOpeningDescriptor;
  surfaces: GeneratedWorldAsset['surfaces'];
  surfaceSelections?: readonly WorldSurfaceSelection[];
  surfaceCharts?: readonly WallSurfaceChart[];
}) {
  const { scene } = useGLTF(`${url}?v=${glbSha256}`);
  const fitKey = plainWallFit ? JSON.stringify(plainWallFit) : '';
  const openingKey = openingDescriptor ? JSON.stringify(openingDescriptor) : '';
  const chartKey = JSON.stringify(surfaceCharts ?? []);
  const bindingKey = JSON.stringify(surfaces ?? []);
  const heightProfileKey = JSON.stringify(heightFit ?? null);
  const rolesKey = JSON.stringify(roles ?? []);
  const nativeHeight = boundsMeters[1];
  const instance = useMemo(() => {
    const object = scene.clone(true);
    const fit = fitKey ? (JSON.parse(fitKey) as PlainWallFit) : undefined;
    const declaredProfile = JSON.parse(heightProfileKey) as
      | GeneratedWorldAsset['heightFit']
      | null;
    const declaredRoles = JSON.parse(rolesKey) as NonNullable<
      GeneratedWorldAsset['roles']
    >;
    const heightProfile =
      declaredProfile ??
      legacyAssetHeightProfile(object, declaredRoles, nativeHeight);
    const fitted = fit
      ? openingKey
        ? fitWallOpeningInstance(
            object,
            JSON.parse(openingKey) as WallOpeningDescriptor
          )
        : fitPlainWallInstance(
            object,
            heightProfile.mode === 'repeat-above'
              ? { ...fit, height: nativeHeight }
              : fit
          )
      : { profile: undefined, owned: [] as THREE.BufferGeometry[] };
    const owned = [...fitted.owned];
    try {
      const sourceBindings = JSON.parse(bindingKey) as NonNullable<
        GeneratedWorldAsset['surfaces']
      >;
      const sourceCharts = JSON.parse(chartKey) as WallSurfaceChart[];
      const originalCharts =
        heightProfile.mode === 'repeat-above'
          ? captureOriginalHeightUvs({
              root: object,
              assetRef,
              bindings: sourceBindings.filter(
                (binding) =>
                  (binding.node === heightProfile.node ||
                    binding.node === heightProfile.capNode) &&
                  !sourceCharts.some((chart) => chart.surfaceId === binding.id)
              ),
            })
          : [];
      const legacyHeight =
        heightProfile.mode === 'fixed'
          ? nativeHeight
          : Math.max(
              heightProfile.mode === 'repeat-above'
                ? heightProfile.baseHeight + (heightProfile.capHeight ?? 0)
                : 0,
              nativeHeight * heightScale
            );
      const requested = fit?.height ?? targetHeight ?? legacyHeight;
      // This hierarchy is new and detached for every fit/height revision.
      // Build all courses before charts/materials; never append to a live root.
      const assembly = assembleAssetHeightInstance({
        root: object,
        nativeHeight,
        targetHeight: requested,
        profile: heightProfile,
        ownedGeometry: owned,
        protectedNodes: declaredRoles
          .filter((role) => role.role === 'leaf')
          .map((role) => role.node),
      });
      owned.push(...assembly.owned);
      applyOriginalHeightUvs({
        root: object,
        assetRef,
        captured: originalCharts,
        nodeCopies: assembly.nodeCopies,
        owned,
      });
      const profile =
        fitted.profile && heightProfile.mode === 'repeat-above'
          ? { ...fitted.profile, height: requested / SYNTY_SCALE }
          : fitted.profile;
      const expanded = expandPartBindings(sourceBindings, assembly.nodeCopies);
      const charts = expandPartSelections(sourceCharts, expanded.ids);
      if (charts.length) {
        if (!fit || !profile || !expanded.bindings.length)
          throw new Error(
            'Room finish charts require an enrolled fitted wall.'
          );
        applyWallSurfaceCharts({
          root: object,
          assetRef,
          bindings: expanded.bindings,
          charts,
          fit,
          profile,
          owned,
        });
      }
      if (
        fit &&
        profile &&
        (fit.clipStart !== undefined || fit.clipEnd !== undefined)
      ) {
        const start = fit.clipStart ?? 0,
          end = fit.clipEnd ?? fit.width;
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < 0 ||
          end > fit.width ||
          end <= start
        )
          throw Error('Invalid wall section visible interval.');
        clipWallSection({
          root: object,
          min: profile.start + (start * profile.width) / fit.width,
          max: profile.start + (end * profile.width) / fit.width,
          owned,
        });
      }
      return {
        object,
        fit,
        profile,
        owned,
        layout: assembly.layout,
        nodeCopies: assembly.nodeCopies,
        bindings: expanded.bindings,
        surfaceIds: expanded.ids,
      };
    } catch (error) {
      for (const geometry of owned) geometry.dispose();
      throw error;
    }
  }, [
    scene,
    fitKey,
    openingKey,
    chartKey,
    bindingKey,
    assetRef,
    heightProfileKey,
    rolesKey,
    nativeHeight,
    heightScale,
    targetHeight,
  ]);
  const cloned = instance.object;
  const fit = instance.fit;
  useEffect(
    () => () => {
      for (const geometry of instance.owned) geometry.dispose();
    },
    [instance]
  );
  const surfaceTreatment = useMemo(
    () =>
      surfaceSelections?.length
        ? {
            bindings: instance.bindings,
            selections: expandPartSelections(
              surfaceSelections,
              instance.surfaceIds
            ),
          }
        : undefined,
    [instance, surfaceSelections]
  );
  const atlasHeightTreatment = useMemo(() => {
    if (!atlasTreatment?.binding) return atlasTreatment;
    const expanded = expandPartBindings(
      atlasTreatment.binding.surfaces,
      instance.nodeCopies
    );
    return {
      ...atlasTreatment,
      binding: { ...atlasTreatment.binding, surfaces: expanded.bindings },
      selections: expandPartSelections(atlasTreatment.selections, expanded.ids),
    };
  }, [atlasTreatment, instance]);
  useRememberedModelTint(
    cloned,
    remembered,
    heightScale,
    visualLighting,
    assetRef,
    'lit',
    surfaceTreatment,
    rememberedTint,
    atlasHeightTreatment
  );
  const parts = useMemo(
    () => (roles && roles.length > 0 ? resolveRoles(cloned, roles) : undefined),
    [cloned, roles]
  );
  const missing = parts && 'node' in parts ? parts : undefined;
  const resolved = parts && !('node' in parts) ? parts : undefined;

  useEffect(() => {
    if (missing) {
      onDiagnostic?.({
        ref: assetRef,
        reason: 'missing-role-node',
        role: missing.role,
        node: missing.node,
      });
    }
  }, [assetRef, missing, onDiagnostic]);

  useEffect(() => {
    if (resolved) {
      onDoorsResolved?.(
        resolved.doors.map(({ id, position: pivot }) => ({
          id,
          position: pivot,
        }))
      );
    }
  }, [onDoorsResolved, resolved]);

  useLayoutEffect(() => {
    if (!resolved) return;
    for (const door of resolved.doors) {
      // `open` is the whole-assembly form: a placed door is one door, so its
      // live state applies to every group its asset declares.
      for (const leaf of door.leaves)
        leaf.node.visible = !hideDoorLeaves && leaf.restVisible;
      if (!hideDoorLeaves)
        applyLeafSwing(
          door.leaves,
          open === true || openDoors.includes(door.id)
        );
    }
  }, [open, openDoors, hideDoorLeaves, resolved]);

  const measuredBounds = useMemo<PropModelBounds>(() => {
    if (fit)
      return {
        minY: 0,
        maxY: fit.height,
        height: fit.height,
        depth: fit.depth,
        width:
          fit.width +
          (((fit.start === undefined ? 0 : 1) +
            (fit.end === undefined ? 0 : 1)) *
            fit.depth) /
            2,
      };
    return {
      minY: 0,
      maxY: instance.layout.height,
      width: boundsMeters[0],
      height: instance.layout.height,
      depth: boundsMeters[2],
    };
  }, [boundsMeters, fit, instance]);
  useEffect(
    () => onBoundsMeasured?.(measuredBounds),
    [measuredBounds, onBoundsMeasured]
  );

  if (missing) return null;
  const profile = instance.profile;
  const fittedScale: [number, number, number] | undefined =
    fit && profile
      ? [
          SYNTY_SCALE * (fit.width / (profile.width * SYNTY_SCALE)),
          SYNTY_SCALE * (fit.height / (profile.height * SYNTY_SCALE)),
          SYNTY_SCALE * (fit.depth / (profile.depth * SYNTY_SCALE)),
        ]
      : undefined;
  const offset =
    fittedScale && profile
      ? new THREE.Vector3(
          -profile.centerX * fittedScale[0],
          -profile.baseY * fittedScale[1],
          -profile.centerZ * fittedScale[2]
        ).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY)
      : new THREE.Vector3();

  return (
    <group
      name="world-asset-model"
      position={[
        position[0] + offset.x,
        position[1] + DUNGEON_SURFACE_Y + offset.y,
        position[2] + offset.z,
      ]}
      rotation={[0, rotationY, 0]}
      scale={
        fittedScale ?? [
          SYNTY_SCALE,
          SYNTY_SCALE * instance.layout.scaleY,
          SYNTY_SCALE,
        ]
      }
      onClick={
        onDoorClick
          ? (event) => {
              // The ground plane behind the door handles clicks too; a click
              // on the door is the door's and must not fall through to it.
              event.stopPropagation();
              onDoorClick();
            }
          : undefined
      }
    >
      <primitive object={cloned as THREE.Object3D} />
    </group>
  );
}

function LoadedAtlasWorldAssetModel({
  resolved,
  ...props
}: React.ComponentProps<typeof LoadedWorldAssetModel> & {
  resolved: ResolvedWorldAtlasMaterials;
}): React.JSX.Element {
  const textures = useLoader(
    THREE.TextureLoader,
    resolved.plans.map((plan) => plan.material.baseColor.url)
  );
  const planKey = JSON.stringify(resolved.plans),
    textureKey = textures.map((texture) => texture.uuid).join(',');
  const atlasTreatment = useMemo(
    () => ({
      glbSha256: props.glbSha256,
      binding: resolved.binding,
      selections: (JSON.parse(planKey) as typeof resolved.plans).map(
        (plan, i) => ({ ...plan, texture: textures[i] })
      ),
    }),
    // Texture UUIDs and plan values own this treatment, not pointer renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.glbSha256, resolved.binding, planKey, textureKey]
  );
  return <LoadedWorldAssetModel {...props} atlasTreatment={atlasTreatment} />;
}

function AtlasWorldAssetModel(
  props: React.ComponentProps<typeof LoadedWorldAssetModel>
): React.JSX.Element | null {
  const catalog = useWorldMaterialCatalog();
  if (catalog.status === 'loading') return null;
  const resolved = resolveWorldAtlasMaterials({
    assetRef: props.assetRef,
    glbSha256: props.glbSha256,
    overrides: props.materialOverrides,
    atlas: catalog.catalog?.atlas,
  });
  return resolved ? (
    <LoadedAtlasWorldAssetModel {...props} resolved={resolved} />
  ) : (
    <LoadedWorldAssetModel {...props} />
  );
}

function PreparedWorldAssetModel({
  plans,
  ...props
}: React.ComponentProps<typeof LoadedWorldAssetModel> & {
  plans: NonNullable<WorldAssetModelProps['surfacePlans']>;
}): React.JSX.Element | null {
  const { scene } = useGLTF(`${props.url}?v=${props.glbSha256}`);
  const planKey = JSON.stringify(plans);
  const requests = plans.flatMap((plan) =>
    (['baseColor', 'normal', 'metallicRoughness', 'occlusion'] as const)
      .filter((role) => !!plan.material[role])
      .map((role) => ({ role, url: plan.material[role]!.url }))
  );
  const textures = useLoader(
    THREE.TextureLoader,
    requests.map((row) => row.url)
  );
  const textureKey = textures.map((texture) => texture.uuid).join(',');
  const selections = useMemo(() => {
    let index = 0;
    return (JSON.parse(planKey) as typeof plans).map((plan) => {
      const binding = props.surfaces?.find(
        (row) => row.id === plan.chart.surfaceId
      );
      if (!binding) throw new Error('Missing provider surface binding.');
      const targets = resolveWorldSurfaceTargets(
        scene,
        binding,
        props.assetRef
      );
      const channel = targets[0].source.normalMap?.channel;
      if (channel === undefined)
        throw new Error('Missing paired surface UV channel.');
      const maps = {} as WorldSurfaceSelection['maps'];
      for (const role of [
        'baseColor',
        'normal',
        'metallicRoughness',
        'occlusion',
      ] as const) {
        if (!plan.material[role]) continue;
        maps[role] = createWorldSurfaceSampler(textures[index++], {
          role:
            role === 'baseColor'
              ? 'baseColor'
              : role === 'normal'
                ? 'normal'
                : 'data',
          channel,
        });
      }
      return { surfaceId: plan.chart.surfaceId, material: plan.material, maps };
    });
    // The cache UUIDs describe immutable source objects; plans are value-keyed
    // so ordinary pointer/selection renders do not churn samplers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, planKey, textureKey, props.surfaces, props.assetRef]);
  useEffect(() => {
    const samplers = selections.flatMap((s) => Object.values(s.maps));
    samplers.forEach((texture) => {
      texture.needsUpdate = true;
    });
    return () => samplers.forEach((texture) => texture.dispose());
  }, [selections]);
  const Model = props.materialOverrides?.length
    ? AtlasWorldAssetModel
    : LoadedWorldAssetModel;
  return (
    <Model
      {...props}
      surfaceSelections={selections}
      surfaceCharts={plans.map((plan) => plan.chart)}
    />
  );
}

/**
 * Generic renderer for provider-normalized world assets. The provider has
 * already baked scale correction, yaw, centering, and grounding into the GLB;
 * ordinary consumers add authored position/yaw and the shared Synty scale.
 * The optional enrolled plain-wall path uses declared body planes for fitting
 * and owns only its changed instance geometry, never cached source buffers.
 * Declared role names are bound per instance; no door node name appears here.
 */
export function WorldAssetModel({
  assetRef,
  materialOverrides,
  position,
  rotationY = 0,
  onBoundsMeasured,
  onDiagnostic,
  heightScale = 1,
  targetHeight,
  remembered = false,
  rememberedTint,
  visualLighting,
  openDoors = [],
  open,
  hideDoorLeaves,
  onDoorClick,
  onDoorsResolved,
  plainWallFit,
  wallOpeningFit,
  surfaceSelections,
  surfacePlans,
  surfaceProvider,
}: WorldAssetModelProps) {
  const safeHeightScale = propVisualScale(heightScale);
  const asset = resolveWorldAsset(assetRef, (diagnostic) =>
    onDiagnostic?.(diagnostic)
  );
  if (!asset) return null;
  if (
    wallOpeningFit &&
    (plainWallFit ||
      !asset.wallOpening ||
      asset.roles?.filter((role) => role.role === 'frame').length !== 1 ||
      ![
        wallOpeningFit.width,
        wallOpeningFit.height,
        wallOpeningFit.depth,
      ].every((v) => Number.isFinite(v) && v > 0) ||
      wallOpeningFit.start !== undefined ||
      wallOpeningFit.end !== undefined)
  )
    throw new Error(
      'This asset requires valid aperture fitting without wall miters.'
    );
  if (
    plainWallFit &&
    !asset.tags.some(
      (tag) => tag === 'wall-body-fit' || tag === 'wall-miter-90'
    )
  )
    throw new Error('This asset is not enrolled for plain wall fitting.');
  if (
    surfaceProvider &&
    (surfaceProvider.assetRef !== assetRef ||
      surfaceProvider.glbSha256 !== asset.glbSha256)
  )
    throw new Error(
      'Surface provider geometry differs from the pinned world asset.'
    );
  const Component = surfacePlans?.length
    ? PreparedWorldAssetModel
    : materialOverrides?.length
      ? AtlasWorldAssetModel
      : LoadedWorldAssetModel;
  return (
    <Component
      plans={surfacePlans ?? []}
      assetRef={assetRef}
      glbSha256={asset.glbSha256}
      materialOverrides={materialOverrides}
      url={asset.url}
      boundsMeters={asset.boundsMeters}
      roles={asset.roles}
      heightFit={asset.heightFit}
      position={position}
      rotationY={rotationY}
      onBoundsMeasured={onBoundsMeasured}
      onDiagnostic={onDiagnostic}
      onDoorsResolved={onDoorsResolved}
      openDoors={openDoors}
      hideDoorLeaves={hideDoorLeaves}
      open={open}
      onDoorClick={onDoorClick}
      heightScale={safeHeightScale}
      targetHeight={targetHeight}
      remembered={remembered}
      rememberedTint={rememberedTint}
      visualLighting={visualLighting}
      plainWallFit={plainWallFit ?? wallOpeningFit}
      openingDescriptor={
        wallOpeningFit && asset.wallOpening
          ? {
              ...asset.wallOpening,
              anchor: wallOpeningFit.anchor,
              frameNode: asset.roles!.find((role) => role.role === 'frame')!
                .node,
              fixedNodes: asset
                .roles!.filter(
                  (role) =>
                    role.role === 'frame' ||
                    role.role === 'above' ||
                    role.role === 'cap'
                )
                .map((role) => role.node),
            }
          : undefined
      }
      surfaces={surfaceProvider?.bindings ?? asset.surfaces}
      surfaceSelections={surfaceSelections}
    />
  );
}
