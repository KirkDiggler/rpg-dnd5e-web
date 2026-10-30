/**
 * THE ONE NEGATION in the studio (rpg-project#719): `{ not: <one predicate> }`
 * read from a file, written back, offered by the predicate editor and the
 * requires picker, said by the Read back, and refused in the engine's words.
 */
import { PREDICATE_SHAPE, type PredicateDoc } from '@/author/factionVocabulary';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { exportDraftYaml, readDraftYaml } from '../encounter-studio/draftFile';
import { createCastleReadBackDocument } from '../encounter-studio/fixtures/castleReadBack';
import { validateOptions, type OptionShape } from './answerTableShape';
import { factIndexOf } from './factIndex';
import { decodeWorldBuilderV4Site } from './fixtures/worldBuilderV4Site';
import { PredicateEditor } from './PredicateEditor';
import {
  NOT_HOLDS_FROM_THE_START_REFUSAL,
  NOT_OF_NOT_REFUSAL,
  OPTION_REQUIRES_FORMS,
  waitedNotRefusal,
} from './predicateNot';
import { predicateSentence } from './predicateSentence';
import { readBackOf } from './readBack';
import type { RoomMonsterBinding } from './roomDraft';
import { CreatureOrders } from './SitePolicies';
import { validatePredicate, type SiteScope } from './siteScope';

/** The castle cook's theft, as the toolkit castle authors it. */
const pilfer: OptionShape = {
  id: 'pilfer',
  say: '(lift a pie from the sill)',
  check: [{ ability: 'sleight-of-hand', dc: 13 }],
  requires: { not: { fact: 'caught-in-kitchen' } },
  success: [{ say: 'The cook never looks round.' }],
  failure: [{ say: 'Thief!', fact: 'caught-in-kitchen' }],
};

/** The web castle with the toolkit castle's S5 fold: `pilfer` first, and the
 * cook's gossip withheld from whoever was caught. */
function castleWithTheTheft() {
  const document = createCastleReadBackDocument();
  const cook = document.draft.room.monsterBindings!.cook!;
  const [gossip, ...rest] = cook.options!;
  cook.options = [
    pilfer,
    { ...gossip!, requires: { not: { fact: 'caught-in-kitchen' } } },
    ...rest,
  ];
  return document;
}

const goblinsNeutral: PredicateDoc = {
  stance: { between: ['goblins', 'party'], is: 'neutral' },
};

describe('the not predicate is read and written', () => {
  it('reads `{ not: <predicate> }` one level down, by the same shape', () => {
    expect(validatePredicate({ not: goblinsNeutral }, 'until')).toEqual({
      not: goblinsNeutral,
    });
    expect(() => validatePredicate({ not: { nope: 1 } }, 'until')).toThrow(
      /^until\.not: a predicate is exactly one of/
    );
  });

  it('reads an option’s `requires: { not }` around a fact or a holding, and refuses the rest by name', () => {
    const line = (requires: unknown) => [
      {
        id: 'hi',
        say: 'Hi.',
        check: [{ ability: 'persuasion', dc: 10 }],
        requires,
      },
    ];
    expect(
      validateOptions(line({ not: { fact: 'caught' } }), 'options', false)[0]!
        .requires
    ).toEqual({ not: { fact: 'caught' } });
    expect(
      validateOptions(line({ not: { holds: 'purse' } }), 'options', false)[0]!
        .requires
    ).toEqual({ not: { holds: 'purse' } });
    expect(() =>
      validateOptions(line({ not: { not: { fact: 'x' } } }), 'options', false)
    ).toThrow(`options[0].requires.not: ${NOT_OF_NOT_REFUSAL}`);
    for (const empty of [{}, null])
      expect(() =>
        validateOptions(line({ not: empty }), 'options', false)
      ).toThrow(
        `options[0].requires.not: this predicate says nothing — ${PREDICATE_SHAPE}`
      );
    expect(() => validateOptions(line({ round: 2 }), 'options', false)).toThrow(
      `options[0].requires: ${OPTION_REQUIRES_FORMS}, and \`round\` is none of them`
    );
    expect(() =>
      validateOptions(line({ not: { round: 2 } }), 'options', false)
    ).toThrow(
      `options[0].requires.not: ${OPTION_REQUIRES_FORMS}, and \`round\` is none of them`
    );
  });

  it('writes the castle’s not requires and a not until to the file and reads them back unchanged', () => {
    const document = castleWithTheTheft();
    // The kitchen turns once the garrison stops being civil.
    document.scope.dispositions = (document.scope.dispositions ?? []).map(
      (d) =>
        d.between.includes('kitchen')
          ? {
              ...d,
              until: {
                not: {
                  stance: { between: ['garrison', 'party'], is: 'neutral' },
                },
              },
            }
          : d
    );
    const read = readDraftYaml(exportDraftYaml(document, 'the-mad-king'));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.draft.room.monsterBindings!.cook!.options!.slice(0, 2)).toEqual(
      document.draft.room.monsterBindings!.cook!.options!.slice(0, 2)
    );
    expect(
      read.scope.dispositions!.find((d) => d.between.includes('kitchen'))!.until
    ).toEqual({
      not: { stance: { between: ['garrison', 'party'], is: 'neutral' } },
    });
  });
});

describe('the Read back says “unless …”', () => {
  it('the cook’s theft and gossip read as withheld from whoever knows caught-in-kitchen', () => {
    const document = castleWithTheTheft();
    const spoken = readBackOf(document, { kind: 'creature', id: 'cook' }).find(
      (p) => p.heading === 'spoken-to'
    )!;
    const items = spoken.items!.map((item) => item.text);
    expect(items[0]).toBe(
      '“(lift a pie from the sill)” Offered unless the speaker knows caught-in-kitchen. Sleight of hand DC 13. Success: “The cook never looks round.” Failure: “Thief!”, and the speaker learns caught-in-kitchen.'
    );
    expect(items[1]).toContain(
      'Offered unless the speaker knows caught-in-kitchen.'
    );
    expect(items[2]).toContain('Offered to a speaker who knows feast-tonight.');
  });

  it('the fact index counts the not requires as a read of the fact', () => {
    const row = factIndexOf(castleWithTheTheft()).find(
      (r) => r.fact === 'caught-in-kitchen'
    );
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).toContain('requires');
  });

  it('a not predicate reads as the inner one turned over', () => {
    const names = new Map([['goblin-1', 'the goblin']]);
    expect(predicateSentence({ not: goblinsNeutral }, { names })).toBe(
      'the goblins and the party are no longer neutral'
    );
    expect(predicateSentence({ not: { down: 'goblin-1' } }, { names })).toBe(
      'the goblin is not down'
    );
    expect(predicateSentence({ not: { fact: 'caught' } }, { names })).toBe(
      'caught is not known'
    );
  });
});

describe('the predicate editor offers not', () => {
  const fixture = decodeWorldBuilderV4Site();
  const scope: SiteScope = {
    factions: fixture.factions,
    dispositions: fixture.dispositions,
  };
  const names = new Map<string, string>();

  function Editor({
    initial,
    onValue,
  }: {
    initial: PredicateDoc | undefined;
    onValue: (next: PredicateDoc | undefined) => void;
  }) {
    const [value, setValue] = useState(initial);
    return (
      <PredicateEditor
        value={value}
        onChange={(next) => {
          setValue(next);
          onValue(next);
        }}
        forms={['round', 'down', 'fact', 'stance']}
        name="Until"
        label="Until"
        none="Never"
        scope={scope}
        room={fixture.draft.room}
        names={names}
      />
    );
  }

  it('wraps the predicate already written, and edits the inner one with the same editor', () => {
    const onValue = vi.fn();
    render(<Editor initial={goblinsNeutral} onValue={onValue} />);
    fireEvent.change(screen.getByLabelText('Until form'), {
      target: { value: 'not' },
    });
    expect(onValue).toHaveBeenLastCalledWith({ not: goblinsNeutral });
    expect(
      (screen.getByLabelText('Until not form') as HTMLSelectElement).value
    ).toBe('stance');
    expect(screen.queryByTestId('Until not refusal')).toBeNull();

    fireEvent.change(screen.getByLabelText('Until not stance is'), {
      target: { value: 'hostile' },
    });
    expect(onValue).toHaveBeenLastCalledWith({
      not: { stance: { between: ['goblins', 'party'], is: 'hostile' } },
    });
  });

  it('says only the outer sentence under a not of a not', () => {
    render(
      <Editor
        initial={{ not: { not: { fact: 'caught' } } }}
        onValue={vi.fn()}
      />
    );
    expect(screen.getByTestId('Until not refusal').textContent).toBe(
      NOT_OF_NOT_REFUSAL
    );
    expect(screen.queryByTestId('Until not not refusal')).toBeNull();
  });

  it('shows the engine’s sentence under a not that can never fire', () => {
    render(<Editor initial={{ not: { fact: 'caught' } }} onValue={vi.fn()} />);
    expect(screen.getByTestId('Until not refusal').textContent).toBe(
      NOT_HOLDS_FROM_THE_START_REFUSAL
    );
    expect(waitedNotRefusal({ not: { not: goblinsNeutral } })).toBe(
      NOT_OF_NOT_REFUSAL
    );
    expect(waitedNotRefusal({ not: goblinsNeutral })).toBeUndefined();
  });
});

describe('the requires picker offers “unless”', () => {
  const fixture = decodeWorldBuilderV4Site();
  const scope: SiteScope = {
    factions: fixture.factions,
    dispositions: fixture.dispositions,
  };
  const goblin = fixture.draft.room.monsterDeclarations.find(
    (monster) => monster.id === 'goblin-1'
  )!;
  const room = {
    ...fixture.draft.room,
    propBindings: { table: { holdable: true } },
  };

  function Creature({
    onBinding,
  }: {
    onBinding: (binding: RoomMonsterBinding | undefined) => void;
  }) {
    const [binding, setBinding] = useState<RoomMonsterBinding | undefined>({
      options: [
        {
          id: 'chat',
          say: 'Smells good.',
          check: [{ ability: 'persuasion', dc: 10 }],
        },
      ],
    });
    return (
      <CreatureOrders
        scope={scope}
        monster={goblin}
        room={room}
        binding={binding}
        onOrdersChange={(next) => {
          setBinding(next);
          onBinding(next);
        }}
      />
    );
  }

  it('withholds a line from a speaker who knows a fact, or carries a prop', () => {
    let latest: RoomMonsterBinding | undefined;
    render(<Creature onBinding={(next) => (latest = next)} />);
    const picker = screen.getByLabelText('Line 1 requires for goblin-1');
    fireEvent.change(picker, { target: { value: 'not-fact' } });
    fireEvent.change(
      screen.getByLabelText('Line 1 requires fact for goblin-1'),
      {
        target: { value: 'caught-in-kitchen' },
      }
    );
    expect(latest?.options?.[0]?.requires).toEqual({
      not: { fact: 'caught-in-kitchen' },
    });

    fireEvent.change(picker, { target: { value: 'not-holds' } });
    expect(latest?.options?.[0]?.requires).toEqual({ not: { holds: 'table' } });

    fireEvent.change(picker, { target: { value: 'fact' } });
    expect(latest?.options?.[0]?.requires).toEqual({ fact: '' });
  });
});
