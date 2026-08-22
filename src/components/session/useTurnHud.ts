/**
 * useTurnHud — the React seam between `useSessionAfford`'s live RPC state
 * and `turnHud.ts`'s pure selection (rpg-dnd5e-web#762 slice 5a). Same
 * shape as `useMoveIndicator` over `moveIndicator.ts`: memoized on
 * exactly the inputs that can change the answer, so `selectTurnHud`
 * reruns only when `clock`/`declarations` actually change, not on every
 * unrelated re-render of the session route.
 */
import type {
  ClockKind,
  Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useMemo } from 'react';
import { selectTurnHud, type TurnHudSelection } from './turnHud';

export function useTurnHud(
  clock: ClockKind,
  declarations: Declaration[]
): TurnHudSelection {
  return useMemo(
    () => selectTurnHud({ clock, declarations }),
    [clock, declarations]
  );
}
