import { describe, expect, it } from 'vitest';
import { createCastleReadBackDocument } from '../encounter-studio/fixtures/castleReadBack';
import { factIndexOf } from './factIndex';

const rowOf = (fact: string, document = createCastleReadBackDocument()) =>
  factIndexOf(document).find((row) => row.fact === fact)!;
const labels = (uses: readonly { label: string }[]) => uses.map((u) => u.label);

describe('factIndexOf', () => {
  it('feast-tonight lists the cook’s gossip and bribe as writers and ashford and the captain’s troupe as readers', () => {
    const row = rowOf('feast-tonight');
    expect(labels(row.writers)).toEqual(['cook: gossip', 'cook: bribe']);
    expect(labels(row.readers).sort()).toEqual(
      ['captain: troupe', 'cook: ashford'].sort()
    );
    expect(row.writers[0].target).toEqual({ kind: 'creature', id: 'cook' });
  });

  it('king-burned-village is written by the cook and the intel, read by the captain', () => {
    const row = rowOf('king-burned-village');
    expect(labels(row.writers).sort()).toEqual(
      ['cook: ashford', 'intel cooks-ledger'].sort()
    );
    expect(labels(row.readers)).toEqual(['captain: turn']);
  });

  it('alarm-raised is written and read by both patrols, and read by the reserves’ arrival', () => {
    const row = rowOf('alarm-raised');
    expect(labels(row.writers)).toEqual(['gate-patrol', 'keep-patrol']);
    expect(labels(row.readers)).toEqual([
      'gate-patrol',
      'keep-patrol',
      'reserve-1 arrives',
      'reserve-2 arrives',
    ]);
  });

  it('king-is-cultist is marked written, never read', () => {
    const row = rowOf('king-is-cultist');
    expect(labels(row.writers)).toEqual(['Altar: examine']);
    expect(row.writers[0].target).toEqual({ kind: 'prop', id: 'altar' });
    expect(row.readers).toEqual([]);
  });

  it('a fact read only by an until is marked read, never written', () => {
    const document = createCastleReadBackDocument();
    document.scope.dispositions!.push({
      between: ['kitchen', 'loyalists'],
      stance: 'neutral',
      until: { fact: 'kitchen-burned' },
    });
    const row = rowOf('kitchen-burned', document);
    expect(row.writers).toEqual([]);
    expect(labels(row.readers)).toEqual(['the kitchen and the loyalists']);
    expect(row.readers[0].target).toEqual({ home: 'dispositions', id: '3' });
  });

  it('nested not and list conditions are found', () => {
    const document = createCastleReadBackDocument();
    document.scope.tables = {
      deep: {
        time: [
          {
            when: [{ enemy: 'seen' }, { not: { not: { fact: 'buried' } } }],
            hold: {},
          },
        ],
      },
    };
    expect(labels(rowOf('buried', document).readers)).toEqual(['deep']);
  });

  it('sorts by fact id and stores nothing in the document', () => {
    const document = createCastleReadBackDocument();
    const before = JSON.stringify(document);
    const facts = factIndexOf(document).map((row) => row.fact);
    expect(facts).toEqual([...facts].sort());
    expect(JSON.stringify(document)).toBe(before);
  });

  it('a patrol row and a march row name no fact: the index does not move (rpg-toolkit#2063)', () => {
    // Moved from the deleted readBack.test.ts (rpg-project#968): a cell and a
    // route are not facts, so rows that walk to them add no index row.
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
    expect(factIndexOf(document).map((row) => row.fact)).toEqual(
      before.map((row) => row.fact)
    );
  });
});
