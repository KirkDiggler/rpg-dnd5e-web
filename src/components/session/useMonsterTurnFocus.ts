import { useDialValues } from '@/feel/dialStore';
import { MemberKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useRef, useState } from 'react';
import type { CubeCoord } from '../hex-grid/hexMath';
import type { SightedMember } from './sightingEntities';
import type { TurnBeat } from './useTurnOrderFollow';

export interface MonsterTurnFocus {
  readonly key: string;
  readonly position: CubeCoord;
}

/** Presentation cursor plus current observer testimony; never roster positions. */
export function useMonsterTurnFocus({
  scope,
  sightings,
}: {
  scope: string;
  sightings: readonly SightedMember[];
}): { focus: MonsterTurnFocus | null; onTurnBeat: (beat: TurnBeat) => void } {
  const enabled = useDialValues().followMonsterTurns === 'on';
  const sequence = useRef(0);
  const [playing, setPlaying] = useState<{
    scope: string;
    actor: string;
    key: string;
  } | null>(null);
  const onTurnBeat = useCallback(
    (beat: TurnBeat) => {
      setPlaying(
        beat.type === 'playing'
          ? {
              scope,
              actor: beat.actor,
              key: `${scope}:${++sequence.current}`,
            }
          : null
      );
    },
    [scope]
  );
  const sighting =
    enabled && playing?.scope === scope
      ? sightings.find(
          (item) =>
            item.subject === playing.actor &&
            !item.remembered &&
            item.kind === MemberKind.MONSTER
        )
      : undefined;
  return {
    focus:
      sighting && playing
        ? { key: playing.key, position: sighting.position }
        : null,
    onTurnBeat,
  };
}

/**
 * THE HAIL TAKES FOCUS (rpg-project#923): the camera centres on the guard
 * whose hail opened the reply panel, through the same keyed presentation
 * focus a monster's turn start uses, read off the same observer testimony.
 * Not behind the follow-monster-turns dial: the hail is the player's own
 * conversation, not someone else's turn. A guard this viewer does not
 * currently see centres nothing.
 */
export function hailTurnFocus(
  hail: { readonly key: string; readonly guard: string } | null,
  sightings: readonly SightedMember[]
): MonsterTurnFocus | null {
  if (!hail) return null;
  const sighting = sightings.find(
    (item) => item.subject === hail.guard && !item.remembered
  );
  return sighting ? { key: hail.key, position: sighting.position } : null;
}
