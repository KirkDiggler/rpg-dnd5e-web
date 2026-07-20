/**
 * Concept adapter over the SHARED message source (#525 slice 2): the real
 * logic lives in src/components/ui/combat/contextMessage.ts — the live
 * dock and every concept composition read the same functions, so the
 * message logic cannot drift. This file only maps the concept fixture
 * shape into the shared ContextInput.
 */

import { EncounterMode } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  contextMessage as sharedContextMessage,
  pillMessage as sharedPillMessage,
  type ContextInput,
  type MessageTone,
} from '../../components/ui/combat';
import type { CombatPanelFixture } from './fixtures';

export type StripTone = MessageTone;

function toContextInput(
  fixture: CombatPanelFixture,
  armedLabel: string | undefined
): ContextInput {
  return {
    mode:
      fixture.mode === 'TURN_BASED'
        ? EncounterMode.TURN_BASED
        : EncounterMode.FREE_ROAM,
    // Concept fixtures have no ended state — the live dock exercises it.
    encounterEnded: false,
    isMyTurn: fixture.isMyTurn,
    activeEntityName: fixture.activeName,
    armedLabel,
    // The same wire-only rule the live dock uses (#545 / the #552 gate):
    // usable = server `available` alone, empty menu = loading, never
    // "nothing left".
    noneUsable:
      fixture.actions.length > 0 && !fixture.actions.some((a) => a.available),
    canStillMove: (fixture.economy?.movementRemaining ?? 0) > 0,
  };
}

export function contextMessage(
  fixture: CombatPanelFixture,
  armedKey: string | undefined,
  armedLabel: string | undefined
): { text: string; tone: StripTone } {
  // armedKey gates identically to the live dock: no label without a key.
  return sharedContextMessage(
    toContextInput(fixture, armedKey ? armedLabel : undefined)
  );
}

export function pillMessage(
  fixture: CombatPanelFixture,
  armedKey: string | undefined,
  armedLabel: string | undefined
): { text: string; tone: StripTone } | null {
  return sharedPillMessage(
    toContextInput(fixture, armedKey ? armedLabel : undefined)
  );
}
