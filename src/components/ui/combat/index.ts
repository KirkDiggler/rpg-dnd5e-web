/**
 * Combat HUD primitives (rpg-dnd5e-web#525) — the composable foundation the
 * combat surface is assembled from. Each primitive renders server-given
 * state and reports intent; none of them know game rules. Visual identity
 * flows from theme tokens (src/themes/) so a sprite skin can replace the
 * look without touching component APIs.
 */

export { DockShell, type DockShellProps } from './DockShell';
export { EconomyPips, type EconomyPipsProps } from './EconomyPips';
export {
  OverlayPanel,
  OverlayToggle,
  type OverlayPanelProps,
  type OverlayToggleProps,
} from './OverlayPanel';
export {
  ReadinessChip,
  type ReadinessChipProps,
  type ReadinessState,
} from './ReadinessChip';
export { VerbButton, type VerbButtonProps } from './VerbButton';
