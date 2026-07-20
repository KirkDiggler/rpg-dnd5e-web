/**
 * Combat HUD primitives (rpg-dnd5e-web#525) — the composable foundation the
 * combat surface is assembled from. Each primitive renders server-given
 * state and reports intent; none of them know game rules. Visual identity
 * flows from theme tokens (public/themes/, the runtime-loaded CSS) so a sprite skin can replace the
 * look without touching component APIs.
 */

export {
  contextMessage,
  pillMessage,
  type ContextInput,
  type MessageTone,
} from './contextMessage';
export { ContextPill, type ContextPillProps } from './ContextPill';
export { DockShell, type DockShellProps } from './DockShell';
export { EconomyPips, type EconomyPipsProps } from './EconomyPips';
export {
  estimateVerbRowWidth,
  shouldCollapse,
  splitInlineVerbs,
  type InlineVerbLayout,
} from './inlineVerbs';
export {
  CORE_TYPES,
  INLINE_CORE_LIMIT,
  groupLabel,
  organizeVerbs,
  verbCost,
  type OrganizedVerbs,
  type VerbGroup,
} from './organizeVerbs';
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
export { VerbButton, type CostShape, type VerbButtonProps } from './VerbButton';
