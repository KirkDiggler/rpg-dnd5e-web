import { EffectState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useState } from 'react';
import { ActionInformationContent } from '../../components/session/combat-experience/ActionInformationContent';
import type {
  ActionEffectLine,
  ActionTooltipLine,
} from '../../components/session/combat-experience/actionTooltip';

interface InformationFixture {
  title: string;
  description: string;
  details: ActionTooltipLine[];
  effects: ActionEffectLine[];
  options?: { id: string; label: string; description: string }[];
}

// Explicit consumer fixtures, not a live description table or a rules fallback.
const fixtures: InformationFixture[] = [
  {
    title: 'Warhammer',
    description: 'Make a melee attack against a creature in reach.',
    details: [
      { label: 'Base damage', value: '1d8 + STR modifier (+3) · Bludgeoning' },
      { label: 'Costs', value: 'Action' },
      { label: 'In reach', value: '2 targets' },
    ],
    effects: [
      {
        id: 'rage',
        name: 'Rage',
        description:
          'Rage can add damage to Strength-based melee weapon attacks.',
        state: EffectState.APPLIES,
        tone: 'applies',
        stateWord: 'Applies',
        reason: 'This is a Strength-based melee weapon attack.',
        benefit: '+2 damage',
      },
    ],
  },
  {
    title: 'Bane',
    // Existing rulebook spells/data.go text, also used by character creation.
    description:
      'Use an action to choose up to three creatures within 30 feet. Each makes a Charisma save. On a failure, it subtracts 1d4 from its attack rolls and saving throws while you concentrate; a successful save avoids the curse. The penalty is rerolled for each affected roll, not applied to damage. Requires concentration, up to 1 minute.',
    details: [
      { label: 'Costs', value: 'Action, 1 1st-level Spell Slots' },
      { label: 'Targets', value: '1–3' },
      { label: 'In reach', value: '2 targets' },
    ],
    effects: [],
  },
  {
    title: 'Dodge',
    description:
      'Attackers have disadvantage against you until your next turn.',
    details: [{ label: 'Costs', value: 'Action' }],
    effects: [],
  },
  {
    title: 'Command',
    description:
      'Give a creature a one-word command. It must obey on its next turn if it fails its saving throw.',
    details: [{ label: 'Costs', value: 'Action, 1 1st-level Spell Slots' }],
    effects: [],
    options: [
      {
        id: 'approach',
        label: 'Approach',
        description: 'The creature moves toward you on its next turn.',
      },
      {
        id: 'flee',
        label: 'Flee',
        description: 'The creature moves away from you on its next turn.',
      },
      {
        id: 'grovel',
        label: 'Grovel',
        description: 'The creature falls prone and ends its next turn.',
      },
    ],
  },
];

/** Outside-in proof of the information body, deliberately disconnected from commands. */
export function ActionInformationConcept() {
  const [index, setIndex] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const fixture = fixtures[index];
  return (
    <section
      style={{ padding: '1rem', color: '#dce5e6' }}
      aria-label="Action information concept"
    >
      <h2>Action information</h2>
      <p>
        Fixture preview — no gameplay commands. Base facts first; contextual
        effects underneath.
      </p>
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          margin: '1rem 0',
        }}
      >
        {fixtures.map((item, i) => (
          <button
            key={item.title}
            type="button"
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
            style={{
              border: '1px solid #d6b573',
              padding: '0.5rem',
              borderRadius: 4,
            }}
          >
            {item.title}
          </button>
        ))}
      </div>
      <label style={{ display: 'block', marginBottom: '1rem' }}>
        <input
          type="checkbox"
          checked={unavailable}
          onChange={(event) => setUnavailable(event.target.checked)}
        />{' '}
        Show unavailable state
      </label>
      <article
        aria-label={`${fixture.title} information`}
        style={{
          maxWidth: 520,
          padding: '1.25rem',
          background: '#101b21',
          border: '1px solid #d6b573',
          borderTopWidth: 3,
          borderRadius: 6,
        }}
      >
        <h3
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '1.5rem',
            color: '#e7d296',
            margin: '0 0 1rem',
          }}
        >
          {fixture.title}
        </h3>
        <ActionInformationContent
          description={fixture.description}
          lines={fixture.details}
          effects={fixture.effects}
        />
        {fixture.options && (
          <section
            aria-label="Choices"
            style={{
              borderTop: '1px solid #d6b57340',
              marginTop: '1rem',
              paddingTop: '0.75rem',
            }}
          >
            <h4>Choices</h4>
            {fixture.options.map((option) => (
              <div key={option.id} style={{ marginTop: '0.75rem' }}>
                <strong>{option.label}</strong>
                <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>
                  {option.description}
                </p>
              </div>
            ))}
          </section>
        )}
        {unavailable && (
          <p style={{ marginTop: '1rem', color: '#e6b2a4' }}>
            Unavailable — action already spent.
          </p>
        )}
      </article>
    </section>
  );
}
