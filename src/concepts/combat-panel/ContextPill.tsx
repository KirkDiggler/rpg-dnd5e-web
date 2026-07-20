/**
 * Concept wrapper over the SHARED ContextPill (#525 slice 2): the pill
 * component itself lives in src/components/ui/combat/ContextPill.tsx (the
 * live dock renders it too); this wrapper only computes the messages from
 * the concept fixture via the contextMessage adapter.
 */

import { ContextPill as SharedContextPill } from '../../components/ui/combat';
import { contextMessage, pillMessage } from './contextMessage';
import type { CombatPanelFixture } from './fixtures';

export interface ContextPillProps {
  fixture: CombatPanelFixture;
  armedKey?: string;
  /** Round-5 floor-viewport scale (composition D). */
  large?: boolean;
}

export function ContextPill({
  fixture,
  armedKey,
  large = false,
}: ContextPillProps) {
  const armedLabel = armedKey
    ? fixture.actions.find((a) => a.ref?.id === armedKey)?.displayName
    : undefined;
  return (
    <SharedContextPill
      pill={pillMessage(fixture, armedKey, armedLabel)}
      announce={contextMessage(fixture, armedKey, armedLabel).text}
      large={large}
    />
  );
}
