import { describe, expect, it } from 'vitest';
import { createCastleReadBackDocument } from '../encounter-studio/fixtures/castleReadBack';
import { ENGINE_LAWS } from './engineLaws';
import { factIndexOf } from './factIndex';
import { readBackOf, type ReadBackParagraph } from './readBack';

const castle = createCastleReadBackDocument();
const creature = (id: string) => readBackOf(castle, { kind: 'creature', id });
const paragraph = (
  paragraphs: readonly ReadBackParagraph[],
  heading: ReadBackParagraph['heading']
) => paragraphs.find((p) => p.heading === heading)!;
const texts = (p: ReadBackParagraph) => p.sentences.map((s) => s.text);

describe('readBackOf over the castle', () => {
  it('gate-1 follows gate-patrol shared with gate-2', () => {
    const time = paragraph(creature('gate-1'), 'on-its-time');
    expect(texts(time)[0]).toBe(
      'On its time it follows gate-patrol, shared with gate-2.'
    );
    expect(time.sentences[0].refs).toContainEqual({
      text: 'gate-patrol',
      target: { kind: 'table', id: 'gate-patrol' },
    });
    expect(texts(time)).toContain(
      'gate-patrol names time, so the kind’s default time rows do not apply.'
    );
  });

  it('gate-1’s rows read in the editor’s vocabulary with their weights', () => {
    const time = texts(paragraph(creature('gate-1'), 'on-its-time'));
    expect(time).toContain('Every row is weighted alike.');
    expect(time).toContain(
      'If it heard a clang within 2 rounds, it walks toward the sound (weight 1).'
    );
    expect(time).toContain(
      'If an enemy is seen and it does not know alarm-raised, it says “To arms! Intruders in the yard!” and raises alarm-raised (weight 1).'
    );
    expect(time).toContain(
      'If an enemy is in reach, it attacks the enemy (weight 1).'
    );
  });

  it('reads a patrol row and a march row in words; the fact index does not move (rpg-toolkit#2063)', () => {
    const document = createCastleReadBackDocument();
    const before = factIndexOf(document);
    const rows = document.scope.tables!['gate-patrol'].time;
    document.scope.tables!['gate-patrol'].time = [
      ...rows,
      {
        when: { enemy: 'none' },
        toward: {
          path: [
            { q: -2, r: 0 },
            { q: 0, r: -2 },
            { q: 2, r: 0 },
            { q: 0, r: 2 },
          ],
        },
      },
      { when: { fact: 'alarm-raised' }, toward: { at: { q: 1, r: 1 } } },
    ];
    const time = texts(
      paragraph(
        readBackOf(document, { kind: 'creature', id: 'gate-1' }),
        'on-its-time'
      )
    );
    expect(time).toContain(
      'If no enemy is seen or remembered, it walks its loop by {q: -2, r: 0}, {q: 0, r: -2}, {q: 2, r: 0} and {q: 0, r: 2} (weight 1).'
    );
    expect(time).toContain(
      'If it knows alarm-raised, it walks to {q: 1, r: 1} (weight 1).'
    );
    // A cell and a route name no fact: the index is the same rows.
    expect(factIndexOf(document).map((row) => row.fact)).toEqual(
      before.map((row) => row.fact)
    );
  });

  it('states the weight law when the weights differ, heaviest row first', () => {
    const document = createCastleReadBackDocument();
    const rows = document.scope.tables!['gate-patrol'].time;
    document.scope.tables!['gate-patrol'].time = [
      rows[0],
      rows[1],
      { ...rows[2], weight: 5 },
    ];
    const time = readBackOf(document, { kind: 'creature', id: 'gate-1' });
    const p = paragraph(time, 'on-its-time');
    expect(texts(p)[1]).toBe(ENGINE_LAWS.weights.sentence);
    expect(p.sentences[1].law).toBe('weights');
    // `layeredOrders` reads the document's order; the codec saves it sorted.
    expect(texts(p)).toContain(
      'If an enemy is in reach, it attacks the enemy (weight 5).'
    );
  });

  it('the cook answers with the kind’s default', () => {
    const time = texts(paragraph(creature('cook'), 'on-its-time'));
    expect(time).toEqual([
      'On its time it answers with the kind’s default: no table and no rows are named by it or its faction.',
    ]);
  });

  it('gate-1’s time paragraph ends with the holds law', () => {
    const time = paragraph(creature('gate-1'), 'on-its-time');
    const last = time.sentences.at(-1)!;
    expect(last.text).toBe('When no row holds, it stands where it is.');
    expect(last.law).toBe('holds');
  });

  it('the cook’s three options read with check, gate and both outcomes', () => {
    const spoken = paragraph(creature('cook'), 'spoken-to');
    expect(texts(spoken)).toEqual(['It can be spoken to.']);
    expect(spoken.items!.map((item) => item.text)).toEqual([
      '“Busy night?” Persuasion DC 10. Success: “Feast for the whole court…”, and the speaker learns feast-tonight. Failure: “Out of my kitchen.”',
      '“What did he do to Ashford?” Offered to a speaker who knows feast-tonight. Persuasion DC 12. Success: the speaker learns king-burned-village. Failure: “I’ve said too much already.”',
      '“Ten gold says you never saw us.” Offered to a speaker carrying the Purse. Persuasion DC 8. Success: “Saw who?”, and the speaker learns feast-tonight. Failure: “Keep your coin.”',
    ]);
  });

  it('the garrison’s disposition reads until the captain knows party-recognized, then hostile', () => {
    const who = paragraph(creature('gate-1'), 'who');
    expect(texts(who)[0]).toBe('gate-1, a Guard of the garrison.');
    expect(texts(who)).toContain(
      'Neutral to the party until captain, the garrison’s mind, knows party-recognized; then hostile.'
    );
    expect(texts(who)).toContain(ENGINE_LAWS.provocation.sentence);
    expect(texts(who)).toContain(
      'Its temper is dealt at spawn from the garrison’s mix: soldier 2, coward 1.'
    );
  });

  it('names the cook as the kitchen’s mind', () => {
    expect(texts(paragraph(creature('cook'), 'who')).slice(0, 2)).toEqual([
      'cook, a Commoner of the kitchen, and the kitchen’s mind.',
      'Neutral to the party, with nothing that turns it.',
    ]);
  });

  it('a creature with no options says nothing can be said to it', () => {
    expect(texts(paragraph(creature('gate-1'), 'spoken-to'))).toEqual([
      'Nothing can be said to it. It has no options.',
    ]);
  });

  it('a creature held in reserve says until when', () => {
    expect(texts(paragraph(creature('reserve-1'), 'who'))).toContain(
      'It is held in reserve until alarm-raised is known.'
    );
  });

  it('says what it carries, writes and reads', () => {
    expect(texts(paragraph(creature('gate-1'), 'knows'))).toEqual([
      'It knows nothing at spawn; it carries no intel.',
      'It writes alarm-raised; it reads alarm-raised.',
    ]);
  });

  it('a prop that holds intel says what it reveals', () => {
    const ledger = readBackOf(castle, { kind: 'prop', id: 'ledger' });
    expect(ledger.map((p) => p.heading)).toEqual(['spoken-to', 'knows']);
    const knows = paragraph(ledger, 'knows');
    expect(texts(knows)).toEqual([
      'It carries cooks-ledger, which reveals king-burned-village.',
      'Anyone can pick it up.',
    ]);
    expect(knows.sentences[0].refs).toEqual([
      { text: 'cooks-ledger', target: { kind: 'intel', id: 'cooks-ledger' } },
      {
        text: 'king-burned-village',
        target: { kind: 'fact', id: 'king-burned-village' },
      },
    ]);
  });

  it('a prop with an option reads it', () => {
    const altar = readBackOf(castle, { kind: 'prop', id: 'altar' });
    expect(paragraph(altar, 'spoken-to').items![0].text).toBe(
      '“Examine the altar.” Investigation DC 12. Success: “Ash, and a sigil of the old god.”, and the speaker learns king-is-cultist.'
    );
  });

  it('a guard’s own time rows name every layer they replace', () => {
    const document = createCastleReadBackDocument();
    document.scope.factions![0]!.on = {
      time: [{ when: { enemy: 'none' }, hold: {} }],
    };
    document.draft.room.monsterBindings!['gate-1']!.on = {
      time: [{ when: { enemy: 'reach' }, attack: 'enemy' }],
    };
    const time = paragraph(
      readBackOf(document, { kind: 'creature', id: 'gate-1' }),
      'on-its-time'
    );
    expect(texts(time)[0]).toBe('On its time it follows its own rows.');
    const replaced = time.sentences.find((s) =>
      s.text.startsWith('Its own rows')
    )!;
    expect(replaced.text).toBe(
      'Its own rows name time, so gate-patrol’s time rows, the garrison’s own time rows and the kind’s default time rows do not apply.'
    );
    expect(replaced.refs).toContainEqual({
      text: 'gate-patrol',
      target: { kind: 'table', id: 'gate-patrol' },
    });
  });
});
