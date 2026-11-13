/**
 * THE SHARING DIAL LOADS, WRITES BACK, AND EDITS ONE KEY (rpg-project#935).
 * The root `party: { sharing: own | view | knowledge }` (rpg-toolkit#2406)
 * is written into the served castle where the engine's root order puts it,
 * between `dispositions` and `intel`. Each word, an unmarked site, a word the
 * studio does not know and a key it does not read all load and download
 * byte for byte; the dial changes `party.sharing` and nothing else.
 */
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  sharingSentence,
  withSharing,
  type SharingWord,
} from '../world-building/partySharing';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

const roundTrips = (text: string) => {
  const result = read(text);
  expect(exportDraftYaml(result, result.key)).toBe(text);
  return result;
};

/** The served castle with a root `party:` block before `intel:`. */
function withParty(block: string): string {
  expect(served).toContain('\nintel:\n');
  expect(served).not.toMatch(/^party:/m);
  return served.replace('\nintel:\n', `\n${block}intel:\n`);
}

/** Downloads the castle after the dial moves to `word`. */
function dialled(text: string, word: SharingWord) {
  const result = read(text);
  const scope = withSharing(result.scope, word);
  return parse(
    exportDraftYaml({ draft: result.draft, scope }, result.key)
  ) as Record<string, unknown>;
}

describe('the party sharing dial round-trips (rpg-project#935)', () => {
  it.each(['own', 'view', 'knowledge'])(
    '`sharing: %s` loads and writes back byte for byte',
    (word) => {
      const result = roundTrips(withParty(`party:\n  sharing: ${word}\n`));
      expect(result.scope.party).toEqual({ sharing: word });
    }
  );

  it('an unmarked site stays unmarked: no `party` is written', () => {
    const result = roundTrips(served);
    expect(result.scope.party).toBeUndefined();
    expect(sharingSentence(result.scope)).toBe(
      "The party's sharing is not set, so it is shared view, the default."
    );
  });

  it('a key and a word the studio does not read are carried, not refused', () => {
    const result = roundTrips(
      withParty('party:\n  sharing: telepathy\n  members: players\n')
    );
    expect(result.scope.party).toEqual({
      sharing: 'telepathy',
      members: 'players',
    });
  });

  it('moving the dial changes only `party.sharing`', () => {
    const before = parse(served) as Record<string, unknown>;
    expect(dialled(served, 'own')).toEqual({
      ...before,
      party: { sharing: 'own' },
    });

    const marked = withParty('party:\n  sharing: own\n  members: players\n');
    const markedBefore = parse(marked) as Record<string, unknown>;
    expect(dialled(marked, 'knowledge')).toEqual({
      ...markedBefore,
      party: { sharing: 'knowledge', members: 'players' },
    });
    // On a marked site the default is the author's choice, and is written.
    expect(dialled(marked, 'view')).toEqual({
      ...markedBefore,
      party: { sharing: 'view', members: 'players' },
    });
  });

  it('choosing the default on an unmarked site writes nothing', () => {
    const result = read(served);
    expect(withSharing(result.scope, 'view')).toEqual(result.scope);
    expect(dialled(served, 'view')).toEqual(parse(served));
  });

  it('a dialled `party` sits where the engine orders it, after `dispositions`', () => {
    const keys = Object.keys(dialled(served, 'own'));
    expect(keys.indexOf('party')).toBe(keys.indexOf('dispositions') + 1);
  });

  it('the read-back says the setting as the engine does', () => {
    const say = (block: string) =>
      sharingSentence(read(withParty(block)).scope);
    expect(say('party:\n  sharing: own\n')).toBe(
      "The party's sharing is set to each their own."
    );
    expect(say('party:\n  sharing: view\n')).toBe(
      "The party's sharing is set to shared view."
    );
    expect(say('party:\n  sharing: knowledge\n')).toBe(
      "The party's sharing is set to shared knowledge. Shared knowledge is not built yet (rpg-project#937), so a run of this site is refused at launch."
    );
  });
});
