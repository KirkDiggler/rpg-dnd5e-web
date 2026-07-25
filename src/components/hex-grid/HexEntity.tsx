/**
 * HexEntity - Visual component for a game entity positioned on a hex
 *
 * Renders character models (players/monsters) or simple shapes (obstacles)
 * at the specified hex position.
 */

import type {
  FacialHairStyle,
  HairStyle,
  ShieldType,
  WeaponType,
} from '@/config/attachmentModels';
import { isTwoHandedWeapon, WEAPON_CONFIGS } from '@/config/attachmentModels';
import type { HeadVariant } from '@/config/characterModels';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { MonsterCombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  ObstacleType,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ErrorBoundary } from '../ui/Feedback/ErrorBoundary';
import { ClassCharacterModel } from './ClassCharacterModel';
import { resolveClassCharacterModelUrl } from './classCharacterModels';
import {
  DEFAULT_HEADING_BY_TYPE,
  MEDIUM_HUMANOID_FORWARD_OFFSET,
  POLYGON_DUNGEON_FORWARD_OFFSET,
  SYNTY_GLB_FORWARD_OFFSET,
} from './facing';
import { cubeToWorld, type CubeCoord } from './hexMath';
import { MediumHumanoid, type SkinTone } from './MediumHumanoid';
import { resolveMonsterModelUrl } from './monsterModels';
import { resolvePropVariantForEntity } from './obstaclePropKeys';
import { PROPS_MODEL_BASE } from './propManifest';
import { PropModel } from './PropModel';
import { useEntityFacing } from './useEntityFacing';
import { useHexMovePath } from './useHexMovePath';

export interface HexEntityProps {
  entityId: string;
  name: string;
  position: CubeCoord;
  type: 'player' | 'monster' | 'obstacle';
  hexSize: number;
  isSelected?: boolean;
  onClick?: (entityId: string) => void;
  /** Character data for texture/shader customization */
  character?: Character;
  /** Monster data for texture selection (includes monsterType) */
  monster?: MonsterCombatState;
  /** v1alpha2 MonsterData.monster_ref.id (e.g. "skeleton",
   * "skeleton-captain") — resolves an npc GLB for monster entities
   * (rpg-dnd5e-web#559), the monster-side counterpart of `classRefId`.
   * Preferred over `monster?.monsterType` when present
   * (monsterModels.ts's resolveMonsterModelUrl). Unmapped/undefined falls
   * back to MediumHumanoid, unchanged (the #479 boundary lineage). */
  monsterRefId?: string;
  /** Override hair style (proto doesn't have this field yet) */
  hairStyle?: HairStyle;
  /** Override hair color as hex string (proto doesn't have this field yet) */
  hairColor?: string;
  /** Override facial hair style (proto doesn't have this field yet) */
  facialHairStyle?: FacialHairStyle;
  /** Whether the entity is dead (show visual dead state, disable interaction) */
  isDead?: boolean;
  /** Whether the entity is outside LoS (v1alpha2). Render at last-known position with ghost shader (semi-transparent, desaturated). */
  isGhost?: boolean;
  /** v1alpha2 CharacterData.class_ref.id — resolves a class GLB for player
   * entities (rpg-dnd5e-web#501). Unmapped/undefined falls back to
   * MediumHumanoid, unchanged (the #479 boundary lineage). */
  classRefId?: string;
  /** True for a CHARACTER entity carrying the "unconscious" condition —
   * swaps to the class's downed GLB variant (rpg-dnd5e-web#501). */
  isDowned?: boolean;
  /** For an OBSTACLE entity, the server's ObstacleType — resolved to a
   * prop reference key (obstaclePropKeys.ts) and rendered as the matching
   * GLB when known; falls back to the primitive capsule for an
   * unspecified/unmapped type (rpg-dnd5e-web#528, charter #523). v1alpha1
   * signal; propRefId below wins when both are present. */
  obstacleType?: ObstacleType;
  /** v1alpha2 obstacle_ref/prop_ref id — the live-route prop-resolver
   * signal (rpg-dnd5e-web#528, charter #523). Preferred over
   * obstacleType when present (obstaclePropKeys.ts's
   * resolvePropKeyForEntity). */
  propRefId?: string;
  /** The most recent genuine move's real hex-by-hex route
   * (`EntityMoved.actualPath`), set only alongside `moveSeq` — see
   * `useEncounterState.ts`'s `mergeEntityPosition` doc comment. Undefined
   * for an entity that has never moved this session. */
  movePath?: CubeCoord[];
  /** Monotonic counter bumped only by a genuine move (rpg-dnd5e-web#542) —
   * `useHexMovePath` watches this, not `position` itself, to distinguish a
   * real move from initial placement or a ghost/revive reconciliation. */
  moveSeq?: number;
}

// Visual state colors
const COLORS = {
  player: {
    default: '#3182ce', // blue
    selected: '#63b3ed', // brighter blue
  },
  monster: {
    default: '#e53e3e', // red
    selected: '#fc8181', // brighter red
  },
  obstacle: {
    default: '#805ad5', // purple
    selected: '#b794f4', // brighter purple
  },
};

// Entity dimensions relative to hex size (used for obstacles/fallback)
const ENTITY_HEIGHT = 1.5; // Height of the cylinder
const ENTITY_RADIUS_SCALE = 0.3; // Radius as fraction of hex size
const Y_OFFSET = 0.1; // Small Y offset to sit above the hex plane

// Character model Y offset (characters stand on the ground)
const CHARACTER_Y_OFFSET = 0.05;

/**
 * Whether the dead/downed corpse tilt (60 degrees about Z) should apply.
 * Exported + pure so the six dead/downed x mapped/unmapped combinations are
 * covered by a real test (HexEntity.test.ts) instead of only by a reviewer
 * reading the JSX carefully — same "pull the composition into arithmetic a
 * test can pin" reasoning as facing.ts's constant-split parity assertions
 * (#590/#592) and the same "export a pure helper straight off the component
 * file for coverage" precedent as HexGrid.tsx's isHexBlocked.
 *
 * Only tilt when falling back to the primitive/MediumHumanoid rendering
 * (`!hasResolvedModel`) — a resolved GLB's own downed/dead variant is
 * already posed for it (rpg-dnd5e-web#501 for players, generalized to
 * monsters by rpg-dnd5e-web#559), so tilting it on top would double up on
 * an already-prone body.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function shouldTiltDeadOrDowned(
  isDead: boolean,
  isDowned: boolean,
  hasResolvedModel: boolean
): boolean {
  return (isDead || isDowned) && !hasResolvedModel;
}

/** Map Race enum to head variant for 3D model */
const RACE_TO_HEAD_VARIANT: Partial<Record<Race, HeadVariant>> = {
  [Race.HUMAN]: 'human',
  [Race.ELF]: 'elf',
  [Race.HALF_ELF]: 'elf',
  [Race.DWARF]: 'dwarf',
  [Race.HALFLING]: 'halfling',
  [Race.GNOME]: 'halfling',
};

/** Map equipment name to WeaponType for 3D models */
const WEAPON_NAME_TO_TYPE: Record<string, WeaponType> = {
  dagger: 'dagger',
  shortsword: 'sword_short',
  longsword: 'sword_long',
  greatsword: 'sword_great',
  handaxe: 'axe_hand',
  battleaxe: 'axe_battle',
  greataxe: 'axe_great',
  club: 'club',
  greatclub: 'club',
  glaive: 'glaive',
};

/** Map shield name to ShieldType */
const SHIELD_NAME_TO_TYPE: Record<string, ShieldType> = {
  shield: 'shield_round',
  'round shield': 'shield_round',
  'kite shield': 'shield_kite',
  'tower shield': 'shield_tower',
};

/**
 * Creates a capsule-like shape for the entity (used for obstacles)
 * Using CapsuleGeometry for a simple 3D representation
 *
 * @param hexSize - The hex radius (for scaling)
 * @returns A THREE.CapsuleGeometry
 */
function createEntityGeometry(hexSize: number): THREE.CapsuleGeometry {
  const radius = hexSize * ENTITY_RADIUS_SCALE;
  const height = ENTITY_HEIGHT;
  // CapsuleGeometry(radius, length, capSegments, radialSegments)
  return new THREE.CapsuleGeometry(radius, height, 8, 16);
}

/**
 * Simple loading placeholder while OBJ models load
 */
function LoadingPlaceholder({
  color,
  hexSize,
}: {
  color: string;
  hexSize: number;
}) {
  const geometry = useMemo(() => createEntityGeometry(hexSize), [hexSize]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} transparent opacity={0.5} />
    </mesh>
  );
}

/** Resolve head variant from race */
function getHeadVariant(race?: Race): HeadVariant | undefined {
  if (race === undefined || race === Race.UNSPECIFIED) return undefined;
  return RACE_TO_HEAD_VARIANT[race];
}

/** Extract weapon type from an equipment slot */
function resolveWeaponType(
  character: Character | undefined,
  slot: 'mainHand' | 'offHand'
): WeaponType | undefined {
  const item = character?.equipmentSlots?.[slot];
  if (!item?.equipment) return undefined;

  const equip = item.equipment;
  if (equip.equipmentData.case !== 'weaponData') return undefined;

  // Match by equipment name (proto WeaponData has no weapon enum field)
  const name = equip.name.toLowerCase().trim();
  return WEAPON_NAME_TO_TYPE[name];
}

/** Check if off-hand has a shield equipped */
function resolveShield(
  character: Character | undefined
): ShieldType | undefined {
  const item = character?.equipmentSlots?.offHand;
  if (!item?.equipment) return undefined;

  const equip = item.equipment;
  if (equip.equipmentData.case === 'armorData') {
    const name = equip.name.toLowerCase().trim();
    return SHIELD_NAME_TO_TYPE[name] ?? 'shield_round';
  }

  return undefined;
}

export function HexEntity({
  entityId,
  position,
  type,
  hexSize,
  isSelected = false,
  onClick,
  character,
  monster,
  monsterRefId,
  hairStyle,
  hairColor,
  facialHairStyle,
  isDead = false,
  isGhost = false,
  classRefId,
  isDowned = false,
  obstacleType,
  propRefId,
  movePath,
  moveSeq,
}: HexEntityProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { invalidate } = useThree();

  // rpg-dnd5e-web#542: steps the player/monster group's rendered position
  // through a genuine move's real hex-by-hex path instead of snapping —
  // see useHexMovePath.ts's module doc comment for the full contract.
  // Cheap to compute unconditionally even for obstacles/downed/dead
  // entities (a no-op hook call, same shape as every other hook here) —
  // only actually wired into the render tree below for the player/monster
  // branch, which is the only one that currently animates position.
  // Caller-owned as of rpg-dnd5e-web#590 — useEntityFacing drives this same
  // group's rotation.y while useHexMovePath drives its position, so the ref
  // has to live here rather than inside either hook.
  const movingGroupRef = useRef<THREE.Group>(null);
  // rpg-dnd5e-web#590: heading lives here, not in the movement hook, so a
  // future attack-facing source is another `requestHeading` caller rather than
  // a refactor. Seeded with the staging pose; movement turns it from there.
  const { requestHeading } = useEntityFacing(
    movingGroupRef,
    DEFAULT_HEADING_BY_TYPE[type] ?? 0
  );
  const { isMoving } = useHexMovePath(
    position,
    movePath,
    moveSeq,
    hexSize,
    CHARACTER_Y_OFFSET,
    movingGroupRef,
    requestHeading
  );

  // Same "sticky failure keyed by url, not a bare boolean" shape as
  // failedEntityModelUrl below — a prop GLB that fails to load falls back
  // to the primitive capsule, but a later obstacleType change (a
  // different resolved url) isn't permanently masked by a stale failure.
  const [failedPropModelUrl, setFailedPropModelUrl] = useState<
    string | undefined
  >(undefined);

  // Tracks a resolved Synty GLB url that failed to load (ErrorBoundary
  // caught a terminal load error) so the downed-tilt check below can still
  // fire once we've fallen back to MediumHumanoid — otherwise a downed/dead
  // entity whose GLB happens to be missing/broken would render upright
  // (rpg-dnd5e-web#502 gate note). One slot covers BOTH the player class
  // model and the monster model (rpg-dnd5e-web#559) — the two are mutually
  // exclusive per `type` (a player entity's resolved url is always
  // `classModelUrl`, a monster's always `monsterModelUrl`, see
  // `resolvedModelUrl` below), so there's no cross-contamination risk in
  // sharing one slot. Compared against the *current* resolvedModelUrl each
  // render rather than a bare boolean so a later class/monster-ref/asset
  // change (or the file becoming available again) isn't permanently masked
  // by a stale failure from a different url.
  const [failedEntityModelUrl, setFailedEntityModelUrl] = useState<
    string | undefined
  >(undefined);

  // R3F runs the canvas in frameloop="demand" mode (HexGrid.tsx). When only
  // the ghost flag changes (entity stays at last_known position), no other
  // prop change triggers a re-render request — the new shader material won't
  // appear until the next user interaction. Force a frame on isGhost
  // transitions so the visual swap is immediate.
  useEffect(() => {
    invalidate();
  }, [isGhost, invalidate]);

  // Convert cube coords to world position
  const worldPos = useMemo(
    () => cubeToWorld(position, hexSize),
    [position, hexSize]
  );

  // Create the entity geometry (used for obstacles)
  const geometry = useMemo(() => createEntityGeometry(hexSize), [hexSize]);

  // Determine color based on type, selection state, and dead state
  const color = isDead
    ? '#666666'
    : isSelected
      ? COLORS[type].selected
      : COLORS[type].default;

  // Handle click events - dead and ghost entities are not interactive.
  // Ghosts represent last-known position outside LoS — clicking would let a
  // player attempt to attack/select an entity they technically can't see.
  const isInert = isDead || isGhost;
  const handleClick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation(); // Prevent hex click from firing
    if (!isInert && onClick) {
      onClick(entityId);
    }
  };

  // Common interaction props for both character models and obstacles.
  // Inert entities (dead or ghost) get no hover/pointer interaction.
  const interactionProps = isInert
    ? {
        onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
      }
    : {
        onClick: handleClick,
        onPointerOver: (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          document.body.style.cursor = 'auto';
        },
      };

  // Use character model for players and monsters
  if (type === 'player' || type === 'monster') {
    const characterClass = character?.class;
    const characterRace = character?.race;
    const monsterType = monster?.monsterType;

    // Resolve appearance from proto data
    const appearance = character?.appearance;
    const skinTone: SkinTone | string = appearance?.skinTone || 'medium';
    const primaryColor = appearance?.primaryColor || undefined;
    const secondaryColor = appearance?.secondaryColor || undefined;

    // Resolve head variant from race
    const headVariant = getHeadVariant(characterRace);

    // Resolve equipped weapons and shield from character data
    const mainHandWeapon = resolveWeaponType(character, 'mainHand');

    // Two-handed weapons occupy both hands - no off-hand or shield
    const isTwoHanded =
      mainHandWeapon && isTwoHandedWeapon(WEAPON_CONFIGS[mainHandWeapon]);
    const offHandWeapon = isTwoHanded
      ? undefined
      : resolveWeaponType(character, 'offHand');
    const shield = isTwoHanded ? undefined : resolveShield(character);

    // Player class GLB (rpg-dnd5e-web#501). Unmapped class / missing
    // classRefId falls through to undefined here, which is exactly the
    // MediumHumanoid fallback signal below (the #479 boundary lineage: a
    // data gap degrades to the known-working placeholder, never a broken
    // model ref).
    const classModelUrl =
      type === 'player'
        ? resolveClassCharacterModelUrl(classRefId, isDowned)
        : undefined;
    // Monster npc GLB (rpg-dnd5e-web#559) — the same resolve-or-undefined
    // shape as classModelUrl above, one entry per promoted crypt-roster
    // monster (monsterModels.ts). `isDead` (not `isDowned`, which is a
    // CHARACTER-only "unconscious" concept — see buildRenderableEntities)
    // is this family's "use the downed pose variant" signal: monsters die
    // at 0 HP rather than going unconscious.
    const monsterModelUrl =
      type === 'monster'
        ? resolveMonsterModelUrl(monsterRefId, monsterType, isDead)
        : undefined;
    // Mutually exclusive by `type` — never both defined for the same
    // entity, so combining them into one resolved url + one sticky-failure
    // slot (failedEntityModelUrl above) is safe.
    const resolvedModelUrl = classModelUrl ?? monsterModelUrl;
    // Same per-type selection the two resolver calls above already made
    // (isDowned for player, isDead for monster) — exposed as its own value
    // so ClassCharacterModel knows whether a zero-clip mount is expected
    // (a downed variant's static collapsed pose) or worth its dev-mode
    // warning (a standing model that should hold a presentable pose).
    const isDownedModelVariant = type === 'player' ? isDowned : isDead;
    // The forward-axis correction is a property of WHICH rig is mounted,
    // not of the entity type in the abstract — a player's resolved model is
    // always the Fantasy Rivals class rig, a monster's is always the
    // POLYGON Dungeon npc rig (facing.ts's #559 hazard callout: never reach
    // for MEDIUM_HUMANOID_FORWARD_OFFSET once an entity renders a real
    // Synty GLB instead of the MediumHumanoid placeholder).
    const modelForwardOffset =
      type === 'player'
        ? SYNTY_GLB_FORWARD_OFFSET
        : POLYGON_DUNGEON_FORWARD_OFFSET;
    // undefined once resolvedModelUrl itself is undefined, or once THIS url
    // has failed to load — never stuck failed against a different url.
    const effectiveModelUrl =
      resolvedModelUrl && resolvedModelUrl !== failedEntityModelUrl
        ? resolvedModelUrl
        : undefined;

    // Shared fallback element — used both as the "no class model" branch
    // and as the ErrorBoundary fallback when a mapped class model exists
    // but its GLB fails to load (missing/unsynced asset, bad file, etc.).
    // Suspense only covers the pending-load state; a terminal load failure
    // throws past it (same reasoning as HexGrid's Synty floor/wall
    // ErrorBoundary wrapping) and would otherwise unmount this entity's
    // whole Canvas tree instead of degrading to the known-working
    // placeholder (the #479 boundary lineage).
    const mediumHumanoidElement = (
      <MediumHumanoid
        color={color}
        isSelected={!isDead && isSelected}
        variant={type === 'monster' ? 'goblin' : 'human'}
        headVariant={headVariant}
        facingRotation={MEDIUM_HUMANOID_FORWARD_OFFSET}
        race={characterRace}
        characterClass={characterClass}
        monsterType={monsterType}
        skinTone={isDead ? '#555' : skinTone}
        primaryColor={isDead ? '#444' : primaryColor}
        secondaryColor={isDead ? '#333' : secondaryColor}
        hairStyle={hairStyle}
        hairColor={isDead ? '#333' : hairColor}
        facialHairStyle={facialHairStyle}
        mainHandWeapon={mainHandWeapon}
        offHandWeapon={offHandWeapon}
        shield={shield}
        showOutline={!isDead}
        ghostAmount={isGhost ? 1.0 : 0.0}
      />
    );

    // rpg-dnd5e-web#542: this group's position is owned entirely by
    // useHexMovePath (via movingGroupRef) — no declarative `position` prop
    // here, see that hook's doc comment for why mixing the two would fight
    // mid-step. Dead/ghost/downed entities still pass through it (moveSeq
    // simply never advances for them beyond whatever their last real move
    // was, so it settles at their current position exactly like the old
    // static prop did).
    return (
      <group ref={movingGroupRef} {...interactionProps}>
        {/* Dead/downed entities rendered with tilt when using the
            MediumHumanoid fallback (no separate collapsed pose asset); a
            resolved GLB's own downed/dead variant is already posed for it,
            so no extra tilt there — true for both the player class model
            and the monster npc model (rpg-dnd5e-web#559 generalized this
            from a player-only check). Ghost entities rendered with ghost
            shader/opacity either way. */}
        <group
          rotation={
            shouldTiltDeadOrDowned(isDead, isDowned, !!effectiveModelUrl)
              ? [0, 0, Math.PI / 3]
              : [0, 0, 0]
          }
        >
          <Suspense
            fallback={<LoadingPlaceholder color={color} hexSize={hexSize} />}
          >
            {effectiveModelUrl ? (
              <ErrorBoundary
                fallback={mediumHumanoidElement}
                onError={() => setFailedEntityModelUrl(effectiveModelUrl)}
              >
                <ClassCharacterModel
                  url={effectiveModelUrl}
                  isSelected={!isDead && isSelected}
                  isGhost={isGhost}
                  facingRotation={modelForwardOffset}
                  isMoving={!isDead && !isGhost && isMoving}
                  isDownedVariant={isDownedModelVariant}
                />
              </ErrorBoundary>
            ) : (
              mediumHumanoidElement
            )}
          </Suspense>
        </group>
      </group>
    );
  }

  // Obstacles: resolve the server's ObstacleType to a shipped prop GLB
  // (rpg-dnd5e-web#528, charter #523) and render it in place of the
  // primitive capsule below. Undefined/unmapped obstacleType, or a GLB
  // that fails to load, falls straight through to the existing capsule —
  // the #479 boundary lineage this codebase already applies to class
  // models (never a broken/missing model reference on screen).
  const propVariant = resolvePropVariantForEntity({ obstacleType, propRefId });
  const propModelUrl = propVariant
    ? PROPS_MODEL_BASE + propVariant.file
    : undefined;
  const effectivePropModelUrl =
    propModelUrl && propModelUrl !== failedPropModelUrl
      ? propModelUrl
      : undefined;

  // Use capsule geometry for obstacles (fallback, and today's default —
  // see propVariant resolution above for the known-key path). Takes an
  // explicit position + whether to attach interaction handlers itself,
  // since it's used two ways below: standalone at the entity's absolute
  // world position (no resolved prop — identical to pre-#528 behavior),
  // or as a Suspense/ErrorBoundary fallback nested in a positioned group
  // (interaction handlers live on the group in that case, not here too).
  const yPosition = Y_OFFSET + ENTITY_HEIGHT / 2;
  const renderCapsule = (
    position: [number, number, number],
    withInteraction: boolean
  ) => (
    <mesh
      ref={meshRef}
      position={position}
      geometry={geometry}
      {...(withInteraction ? interactionProps : {})}
    >
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.2 : 0}
      />
    </mesh>
  );

  if (!propVariant || !effectivePropModelUrl) {
    return renderCapsule([worldPos.x, yPosition, worldPos.z], true);
  }

  return (
    <group position={[worldPos.x, 0, worldPos.z]} {...interactionProps}>
      <Suspense fallback={renderCapsule([0, yPosition, 0], false)}>
        <ErrorBoundary
          fallback={renderCapsule([0, yPosition, 0], false)}
          onError={() => setFailedPropModelUrl(effectivePropModelUrl)}
        >
          <PropModel variant={propVariant} position={[0, 0, 0]} />
        </ErrorBoundary>
      </Suspense>
    </group>
  );
}
