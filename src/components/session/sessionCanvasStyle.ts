import type { CSSProperties } from 'react';

/**
 * The canvas wrapper's style.
 *
 * THE CANVAS IS ONE LAYER UNDER THE HUD (`isolation: isolate`). drei's `Html`
 * labels — a speech bubble, a voice cue, a verb menu, a roll flash — are DOM
 * elements inside this wrapper with z-indexes of their own (up to 30). Without
 * a stacking context here they competed with the HUD's panels, and one that
 * projected under a story notice sat ON TOP of it: a click on the notice, or
 * on its "Details", landed on the label, bubbled into the canvas's own event
 * root, and became a walk to the floor under the notice (the operator's
 * finding on rpg-dnd5e-web#1416). Isolated, every label stays above the 3D
 * scene and beneath every sibling HUD layer, whatever its own z-index; touch
 * mode already did this with `zIndex: 0`.
 */
export function sessionCanvasStyle(props: {
  readonly interactionEnabled?: boolean;
  readonly touchPanEnabled?: boolean;
}): CSSProperties {
  return {
    width: '100%',
    height: '100%',
    pointerEvents: props.interactionEnabled === false ? 'none' : 'auto',
    isolation: 'isolate',
    // Keep renderer/Html layers beneath sibling HUD panels without disabling
    // the canvas: touch camera gestures must still work while aiming.
    zIndex: props.touchPanEnabled ? 0 : undefined,
  };
}
