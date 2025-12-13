/**
 * Barrel export for hex-grid-v2 components
 */

export { HexGridV2 } from './HexGridV2';
export type { HexGridV2Props } from './HexGridV2';

export { HexEntity } from './HexEntity';
export type { HexEntityProps } from './HexEntity';
export { HexTile } from './HexTile';

export { useHexInteraction } from './useHexInteraction';
export type {
  UseHexInteractionProps,
  UseHexInteractionReturn,
} from './useHexInteraction';

export {
  cubeToWorld,
  hexDistance,
  worldToCube,
  type CubeCoord,
  type WorldPos,
} from './hexMath';

export { TurnOrderOverlay } from './TurnOrderOverlay';
export type { TurnOrderEntry, TurnOrderOverlayProps } from './TurnOrderOverlay';
