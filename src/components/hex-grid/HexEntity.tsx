/**
 * HexEntity - Visual component for a game entity positioned on a hex
 *
 * Renders character models (players/monsters) or simple shapes (obstacles)
 * at the specified hex position.
 */

import { resolveHairPresentation } from '@/character/customization/hairCustomization';
import {
  resolveOutfitPresentation,
  type CharacterCustomizationContainer,
} from '@/character/customization/outfitCustomization';
import type {
  FacialHairStyle,
  HairStyle,
  ShieldType,
  WeaponType,
} from '@/config/attachmentModels';
import { isTwoHandedWeapon, WEAPON_CONFIGS } from '@/config/attachmentModels';
import type { HeadVariant } from '@/config/characterModels';
import type { HairCustomization } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
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
import { resolvePlayerCharacterModel } from './classCharacterModels';
import {
  DEFAULT_HEADING_BY_TYPE,
  MEDIUM_HUMANOID_FORWARD_OFFSET,
  POLYGON_DUNGEON_FORWARD_OFFSET,
  SYNTY_GLB_FORWARD_OFFSET,
} from './facing';
import { cubeToWorld, type CubeCoord } from './hexMath';
import type { MainHandPresentation } from './mainHandPresentation';
import { mainHandSocketForRigFamily } from './mainHandWeapons';
import { MediumHumanoid } from './MediumHumanoid';
import { resolveMonsterModelUrl } from './monsterModels';
import { resolvePropVariantForEntity } from './obstaclePropKeys';
import {
  offHandSocketForRigFamily,
  type OffHandPresentation,
} from './offHandEquipment';
import { PROPS_MODEL_BASE } from './propManifest';
import { PropModel } from './PropModel';
import {
  CRYPT_MEMORY_COLOR,
  isRemembered,
  type SceneKnowledgeState,
} from './sceneKnowledge';
import { useEntityFacing } from './useEntityFacing';
import { useHexMovePath } from './useHexMovePath';

export interface HexEntityProps {
  entityId: string;
  name: string;
  position: CubeCoord;
  /** 'npc' is a placed, non-combatant MEMBER_KIND_WORLD member (e.g. a
   * vendor) — renders through the same MediumHumanoid placeholder branch
   * as 'player' (neutral 'human' variant, unarmed), never the 'monster'
   * path's goblin fallback or class/race/weapon resolution. */
  type: 'player' | 'monster' | 'obstacle' | 'npc';
  hexSize: number;
  isSelected?: boolean;
  onClick?: (entityId: string) => void;
  /** Fires when the pointer enters this entity's own model geometry —
   * rpg-project#249, Kirk's own live-walk finding: the hover affordance
   * ("Attack <name>" / its shortfall) only resolved over the raw hex,
   * never over the model itself, because nothing reported hover at the
   * entity level; a caller reading only the ground plane's own
   * `onPointerMove` never learns the cursor is over a mesh sitting in
   * front of it along the same ray. Same reasoning as `onClick`'s own
   * doc comment below — one resolution path, not two. */
  onPointerOver?: (entityId: string) => void;
  /** Fires when the pointer leaves this entity's own model geometry. */
  onPointerOut?: () => void;
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
  /** The colour of the SIDE this member fights for, when the author
   * declared one (rpg-project#375 §7, `factionColor.ts`). Overrides the
   * kind's own colour for the ring and the placeholder; absent for a
   * player, an unauthored monster or a world NPC, which keep the blue,
   * red and gold they always had. Presentation only — it decides nothing
   * about who may be attacked. */
  factionColor?: string;
  /** Whether the entity is outside LoS (v1alpha2). Render at last-known position with ghost shader (semi-transparent, desaturated). */
  isGhost?: boolean;
  /**
   * Personal knowledge state (rpg-dnd5e-web#604). `'remembered'` renders the
   * viewer's last observation, frozen and inert — no handlers, no selection,
   * no movement, no cursor. Distinct from `isGhost`, which is a live entity
   * drawn at a last-known position and stays clickable-but-inert.
   * Undefined means live, so every existing caller is unchanged.
   */
  knowledgeState?: SceneKnowledgeState;
  /** Public roster class ref id — resolves a player GLB when one is mapped.
   * Unmapped/undefined falls back to MediumHumanoid, unchanged (the #479
   * boundary lineage). */
  classRefId?: string;
  /** Public roster race ref id — paired with classRefId for exact promoted
   * player models; blank/missing falls back to honest class or neutral
   * placeholder. */
  raceRefId?: string;
  /** Complete owner Appearance / peer public Customization projection.
   * Only a standing active player body consumes hair and outfit treatments. */
  customization?: CharacterCustomizationContainer;
  /** @deprecated Compatibility seam for old callers; new owner/peer paths use
   * `customization` so sibling Hair and Outfit cannot be separated. */
  hairCustomization?: HairCustomization;
  /** Exact owner-authoritative visual projection for this player's main hand.
   * Undefined means unarmed; only class GLBs consume it. */
  mainHandPresentation?: MainHandPresentation;
  /** Exact owner-private visual projection for this player's off hand.
   * Undefined means no reviewed off-hand presentation. */
  offHandPresentation?: OffHandPresentation;
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
  /**
   * Computed wall-facing rotationY for a wall-mounted decor prop
   * (rpg-game-assets#36 wave-1, issue #623 increment 5 — HexGrid's
   * `WALL_ADJACENT_PROP_KEYS`/`computeWallAdjacentRotationY`). Undefined
   * for every entity that isn't one of those keys, or that has no wall
   * neighbor to face — falls back to PropModel's own rotationY=0 default,
   * unchanged from every pre-#623 caller.
   */
  propRotationY?: number;
  /** The most recent genuine move's real hex-by-hex route
   * (`EntityMoved.actualPath`), set only alongside `moveSeq` — see
   * `useEncounterState.ts`'s `mergeEntityPosition` doc comment. Undefined
   * for an entity that has never moved this session. */
  movePath?: CubeCoord[];
  /** Monotonic counter bumped only by a genuine move (rpg-dnd5e-web#542) —
   * `useHexMovePath` watches this, not `position` itself, to distinguish a
   * real move from initial placement or a ghost/revive reconciliation. */
  moveSeq?: number;
  /** Presentation-only completion for this entity's exact move sequence. */
  onMovementPresentationComplete?: (entityId: string, moveSeq: number) => void;
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
  npc: {
    default: '#d69e2e', // gold
    selected: '#f6d55c', // brighter gold
  },
};

// Entity dimensions relative to hex size (used for obstacles/fallback)
const ENTITY_HEIGHT = 1.5; // Height of the cylinder
const ENTITY_RADIUS_SCALE = 0.3; // Radius as fraction of hex size
const Y_OFFSET = 0.1; // Small Y offset to sit above the hex plane

// Clear the default 0.20 Synty floor and slightly negative GLB foot minima.
const CHARACTER_Y_OFFSET = 0.21;
const CRYPT_HEX = `#${CRYPT_MEMORY_COLOR.getHexString()}`;

/** Keeps generic fallback state treatment independent of retired appearance fields. */
// eslint-disable-next-line react-refresh/only-export-components
export function mediumHumanoidFallbackColors(
  remembered: boolean,
  isDead: boolean
) {
  return {
    skinTone: remembered ? CRYPT_HEX : isDead ? '#555' : undefined,
    primaryColor: remembered ? CRYPT_HEX : isDead ? '#444' : undefined,
    secondaryColor: remembered ? CRYPT_HEX : isDead ? '#333' : undefined,
  } as const;
}

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
  onPointerOver: onPointerOverProp,
  onPointerOut: onPointerOutProp,
  character,
  monster,
  monsterRefId,
  hairStyle,
  hairColor,
  facialHairStyle,
  isDead = false,
  factionColor,
  isGhost = false,
  knowledgeState,
  classRefId,
  raceRefId,
  customization,
  hairCustomization,
  mainHandPresentation,
  offHandPresentation,
  isDowned = false,
  obstacleType,
  propRefId,
  propRotationY,
  movePath,
  moveSeq,
  onMovementPresentationComplete,
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
  // A memory does not move. Withholding the path here (rather than ignoring
  // it downstream) means the frozen entity settles at its last observed hex.
  const remembered = isRemembered(knowledgeState);
  // The fallback humanoid is cel-shaded from flat colours rather than GLB
  // materials, so its crypt treatment is those colours sourced from the one
  // shared constant — not a second palette.
  const cryptHex = CRYPT_HEX;
  const { isMoving } = useHexMovePath(
    position,
    remembered ? undefined : movePath,
    remembered ? undefined : moveSeq,
    hexSize,
    CHARACTER_Y_OFFSET,
    movingGroupRef,
    requestHeading,
    (completedMoveSeq) =>
      onMovementPresentationComplete?.(entityId, completedMoveSeq)
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
  const [failedEntityModelUrls, setFailedEntityModelUrls] = useState<
    ReadonlySet<string>
  >(() => new Set());

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
  const selected = isSelected && !remembered;
  const color = isDead
    ? '#666666'
    : selected
      ? (factionColor ?? COLORS[type].selected)
      : (factionColor ?? COLORS[type].default);

  // Handle click events - dead and ghost entities are not interactive.
  // Ghosts represent last-known position outside LoS — clicking would let a
  // player attempt to attack/select an entity they technically can't see.
  const isInert = isDead || isGhost || remembered;
  const handleClick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation(); // Prevent hex click from firing
    if (!isInert && onClick) {
      onClick(entityId);
    }
  };

  // Common interaction props for both character models and obstacles.
  // Inert entities (dead or ghost) get no hover/pointer interaction.
  // A remembered entity gets NO handlers at all — not even the ghost's
  // stop-propagating no-op. It is scenery, and a click should fall through to
  // the hex underneath it.
  const interactionProps = remembered
    ? {}
    : isInert
      ? {
          onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
        }
      : {
          onClick: handleClick,
          onPointerOver: (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
            onPointerOverProp?.(entityId);
          },
          onPointerOut: () => {
            document.body.style.cursor = 'auto';
            onPointerOutProp?.();
          },
        };

  // Use character model for players, monsters, and world NPCs. 'npc' takes
  // this branch purely to reach the shared MediumHumanoid placeholder below
  // (neither resolvePlayerCharacterModel nor resolveMonsterModelUrl fire for
  // it, since both remain gated on their own exact type check) — it never
  // resolves a class or monster GLB of its own.
  if (type === 'player' || type === 'monster' || type === 'npc') {
    const characterClass = character?.class;
    const characterRace = character?.race;
    const monsterType = monster?.monsterType;

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

    // Player GLB (public race/class identity). Exact promoted race+class
    // standing models win when shipped; missing/blank race falls back to the
    // honest class GLB, and unmapped class still falls through to the known
    // MediumHumanoid placeholder.
    const playerModelResolution =
      type === 'player'
        ? resolvePlayerCharacterModel(raceRefId, classRefId, isDowned)
        : undefined;
    const classModelUrl = playerModelResolution?.url;
    const mainHandSocketOverride = playerModelResolution
      ? mainHandSocketForRigFamily(playerModelResolution.rigFamily)
      : undefined;
    const offHandSocketOverride = playerModelResolution
      ? offHandSocketForRigFamily(playerModelResolution.rigFamily)
      : undefined;
    // Monster npc GLB (rpg-dnd5e-web#559) — the same resolve-or-undefined
    // shape as classModelUrl above, one entry per promoted crypt-roster
    // monster (monsterModels.ts). `isDead` (not `isDowned`, which is a
    // CHARACTER-only "unconscious" concept — see buildRenderableEntities)
    // is this family's "use the downed pose variant" signal: monsters die
    // at 0 HP rather than going unconscious. `entityId` (rpg-dnd5e-web#673)
    // is this entity's own stable id — keys the deterministic style pick
    // for a multi-candidate ref (today, only `zombie`); every render of the
    // same entity passes the same id, so the picked style never flickers.
    const monsterModelUrl =
      type === 'monster'
        ? resolveMonsterModelUrl(monsterRefId, monsterType, isDead, entityId)
        : undefined;
    // Mutually exclusive by `type` — never both defined for the same
    // entity, so combining them into one resolved url + one sticky-failure
    // slot (failedEntityModelUrl above) is safe.
    const resolvedModelUrl = classModelUrl ?? monsterModelUrl;
    // Only generated profile truth can name an exact complete class fallback.
    // Monsters and unsupported profiles retain one-step MediumHumanoid degradation.
    const generatedClassFallbackUrl =
      type === 'player' ? playerModelResolution?.fallbackUrl : undefined;
    const effectiveModelUrl = [resolvedModelUrl, generatedClassFallbackUrl]
      .filter((url): url is string => Boolean(url))
      .find((url) => !failedEntityModelUrls.has(url));
    const isPrimaryCustomizationBody =
      effectiveModelUrl === classModelUrl &&
      playerModelResolution?.customizationProfileRef !== undefined &&
      !isDowned;
    const completeCustomization =
      customization ??
      (hairCustomization ? { hair: hairCustomization } : undefined);
    const hairPresentation = isPrimaryCustomizationBody
      ? resolveHairPresentation({
          raceRefId,
          classRefId,
          customization: completeCustomization,
        })
      : undefined;
    const outfitResolution = isPrimaryCustomizationBody
      ? resolveOutfitPresentation({
          classRefId,
          customization: completeCustomization,
        })
      : undefined;
    const outfitPresentation =
      outfitResolution && !('presentation' in outfitResolution)
        ? outfitResolution
        : undefined;
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
    // Shared fallback element — used both as the "no class model" branch
    // and as the ErrorBoundary fallback when a mapped class model exists
    // but its GLB fails to load (missing/unsynced asset, bad file, etc.).
    // Suspense only covers the pending-load state; a terminal load failure
    // throws past it (same reasoning as HexGrid's Synty floor/wall
    // ErrorBoundary wrapping) and would otherwise unmount this entity's
    // whole Canvas tree instead of degrading to the known-working
    // placeholder (the #479 boundary lineage).
    const fallbackColors = mediumHumanoidFallbackColors(remembered, isDead);
    const mediumHumanoidElement = (
      <MediumHumanoid
        color={remembered ? cryptHex : color}
        isSelected={!isDead && selected}
        variant={type === 'monster' ? 'goblin' : 'human'}
        headVariant={headVariant}
        facingRotation={MEDIUM_HUMANOID_FORWARD_OFFSET}
        race={characterRace}
        characterClass={characterClass}
        monsterType={monsterType}
        skinTone={fallbackColors.skinTone}
        primaryColor={fallbackColors.primaryColor}
        secondaryColor={fallbackColors.secondaryColor}
        hairStyle={hairStyle}
        hairColor={remembered ? cryptHex : isDead ? '#333' : hairColor}
        facialHairStyle={facialHairStyle}
        mainHandWeapon={mainHandWeapon}
        offHandWeapon={type === 'player' ? undefined : offHandWeapon}
        shield={type === 'player' ? undefined : shield}
        showOutline={!isDead && !remembered}
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
        {/* Raycast proxy (rpg-dnd5e-web unit/game-fidelity, Bug A): a
            THREE.SkinnedMesh raycasts against its BIND-POSE geometry, not
            the pose the idle/walk clip actually renders — the animation
            sways the visible body away from that invisible volume, so a
            click on the visible model hits or misses depending on which
            animation frame is showing, with no console signal on a miss.
            This capsule is a plain (non-skinned) mesh at a FIXED local
            transform, so it always raycasts exactly where it visually sits
            — same footprint/height convention as the obstacle capsule
            (`createEntityGeometry`/`ENTITY_HEIGHT` above), just invisible
            (zero-opacity material, not `visible={false}` — an invisible
            object is still raycast-testable in three.js, `visible={false}`
            is not; `DungeonPreview3D.tsx`'s `FloorHitCell` establishes the
            same zero-opacity-material idiom in this codebase). It carries
            no handlers of its own — this group's `interactionProps` above
            already bubble from any raycast-hit descendant, the same as
            every other child here. ClassCharacterModel opts its own
            skinned meshes OUT of raycasting entirely (see its `cloned`
            useMemo), so this proxy is the only thing left to hit once a
            GLB is mounted — also a perf win (one capsule test instead of
            walking a full skinned mesh tree). MediumHumanoid's fallback
            primitives are NOT skinned (ordinary transformed meshes, whose
            raycast already tracks their real pose correctly) and are left
            raycast-enabled, so this proxy only ADDS coverage there, never
            removes any. */}
        <mesh geometry={geometry} position={[0, ENTITY_HEIGHT / 2, 0]}>
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
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
                key={effectiveModelUrl}
                fallback={mediumHumanoidElement}
                onError={() =>
                  setFailedEntityModelUrls((failed) => {
                    const next = new Set(failed);
                    next.add(effectiveModelUrl);
                    return next;
                  })
                }
              >
                <ClassCharacterModel
                  url={effectiveModelUrl}
                  isSelected={!isDead && selected}
                  isGhost={isGhost}
                  remembered={remembered}
                  facingRotation={modelForwardOffset}
                  isMoving={!isDead && !isGhost && !remembered && isMoving}
                  isDownedVariant={isDownedModelVariant}
                  mainHandPresentation={
                    type === 'player' ? mainHandPresentation : undefined
                  }
                  mainHandSocketOverride={mainHandSocketOverride}
                  offHandPresentation={
                    type === 'player' ? offHandPresentation : undefined
                  }
                  offHandSocketOverride={offHandSocketOverride}
                  accessories={hairPresentation?.accessories}
                  outfit={outfitPresentation}
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
        color={remembered ? cryptHex : color}
        emissive={selected ? color : '#000000'}
        emissiveIntensity={selected ? 0.2 : 0}
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
          <PropModel
            variant={propVariant}
            position={[0, 0, 0]}
            rotationY={propRotationY}
            remembered={remembered}
          />
        </ErrorBoundary>
      </Suspense>
    </group>
  );
}
