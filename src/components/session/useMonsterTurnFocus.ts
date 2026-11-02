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
