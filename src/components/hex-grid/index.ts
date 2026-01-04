/**
 * Barrel export for hex-grid components
 */

export { HexGrid } from './HexGrid';
export type { HexGridProps } from './HexGrid';

export { HexEntity } from './HexEntity';
export type { HexEntityProps } from './HexEntity';
export { HexTile } from './HexTile';
export { HexWall } from './HexWall';
export type { HexWallProps } from './HexWall';

export { useHexInteraction } from './useHexInteraction';
export type {
  UseHexInteractionProps,
  UseHexInteractionReturn,
} from './useHexInteraction';

export {
  HEX_DIRECTIONS,
  coordToKey,
  cubeToWorld,
  hexDistance,
  worldToCube,
  type CubeCoord,
  type WorldPos,
} from './hexMath';

export { TurnOrderOverlay } from './TurnOrderOverlay';
export type { TurnOrderEntry, TurnOrderOverlayProps } from './TurnOrderOverlay';
