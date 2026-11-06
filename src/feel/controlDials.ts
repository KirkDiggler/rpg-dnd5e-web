import type { DialSpec } from './dialTypes';

/**
 * How a click on the map behaves, per browser (rpg-project#872 D2). Kept in
 * the same store as the camera and dice dials, so it is remembered in this
 * browser's storage (wrapped safely, see dialStore.ts) and a link can carry
 * it (`?clickToAct=off`).
 *
 * `clickToAct` on: a click on a creature does what the server offers for him,
 * walking up to a hostile and swinging when this turn's walk reaches him,
 * and showing the choices when he offers more than one verb. Off: a click on
 * a creature behaves exactly as it did before. ON is a placeholder default;
 * Kirk: "the dial is the important part the default can come later".
 */
export const CLICK_TO_ACT_DIAL = 'clickToAct';

export const CONTROL_DIAL_SPECS: readonly DialSpec[] = [
  {
    key: CLICK_TO_ACT_DIAL,
    label: 'Click a creature to act (walk up, attack, speak)',
    group: 'controls',
    kind: 'enum',
    default: 'on',
    options: ['off', 'on'],
  },
];
