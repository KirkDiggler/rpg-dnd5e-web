import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DiceRollGroupInput } from './diceRollGroup';
import { createRollGroupNarrationFacts } from './rollGroupNarrationModel';
import type { RollGroupDieAppearance } from './RollGroupPresentation';
import type { RerollBatch } from './rollGroupPresentationModel';
import type { RollGroupPresentationState } from './rollGroupPresentationState';

export function RollGroupNarration({
  presentationId,
  witnessRole,
  rendererGeneration,
  group,
  state,
  rerollBatches,
  appearances,
  visibleModifierCount,
}: {
  readonly presentationId: string;
  readonly witnessRole: 'roller' | 'spectator';
  readonly rendererGeneration: number;
  readonly group: DiceRollGroupInput;
  readonly state: RollGroupPresentationState;
  readonly rerollBatches: readonly RerollBatch[];
  readonly appearances: readonly RollGroupDieAppearance[];
  readonly visibleModifierCount: number;
}) {
  const identity = `${presentationId}:${witnessRole}:${rendererGeneration}`;
  const facts = useMemo(
    () =>
      createRollGroupNarrationFacts({
        group,
        state,
        rerollBatches,
        appearances,
        visibleModifierCount,
      }),
    [appearances, group, rerollBatches, state, visibleModifierCount]
  );
  const announced = useRef<{
    identity: string;
    keys: Set<string>;
  }>({ identity, keys: new Set() });
  const [live, setLive] = useState({ revision: 0, text: '' });

  useLayoutEffect(() => {
    if (announced.current.identity !== identity) {
      announced.current = { identity, keys: new Set() };
      setLive({ revision: 0, text: '' });
    }
    const newFacts = facts.filter(
      (candidate) => !announced.current.keys.has(candidate.key)
    );
    if (newFacts.length === 0) return;
    for (const candidate of newFacts) announced.current.keys.add(candidate.key);
    setLive((current) => ({
      revision: current.revision + 1,
      text: newFacts.map((candidate) => candidate.text).join(' '),
    }));
  }, [facts, identity]);

  return (
    <>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="roll-group-live-narration"
        data-live-revision={live.revision}
        data-renderer-generation={rendererGeneration}
      >
        <span key={live.revision}>{live.text}</span>
      </p>
      <ol
        aria-label="Supplied roll result narration"
        className="sr-only"
        data-testid="roll-group-semantic-log"
      >
        {facts.map((candidate) => (
          <li key={candidate.key} data-testid="roll-group-narration-fact">
            {candidate.text}
          </li>
        ))}
      </ol>
    </>
  );
}
