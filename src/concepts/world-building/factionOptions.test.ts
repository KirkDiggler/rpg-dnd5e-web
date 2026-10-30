/**
 * A faction's `options` (rpg-project#718, rpg-project#732): the lines a
 * character can say to ANY member, written once for the side and layered the
 * way `on:` is. The fixture is the stack's survivors walk, whose band speaks
 * two lines its members do not carry.
 */
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { exportDraftYaml, readDraftYaml } from '../encounter-studio/draftFile';
import survivorsWalkYaml from '../encounter-studio/fixtures/stack-sites/survivors-walk.yaml?raw';
import { readBackOf } from './readBack';
import {
  addSiteFactionOption,
  removeSiteFactionOption,
} from './sitePolicyEdits';
import { OPTIONS_EMPTY_REFUSAL, validateSiteFactions } from './siteScope';

function opened(text: string) {
  const read = readDraftYaml(text);
  if (!read.ok) throw new Error(read.refusal);
  return read;
}

describe('a faction’s lines (rpg-project#718)', () => {
  it('opens the survivors walk with the band’s two lines', () => {
    const read = opened(survivorsWalkYaml);
    const band = read.scope.factions?.find((f) => f.id === 'band');
    expect(band?.options?.map((o) => o.id)).toEqual(['yield', 'refuse']);
    expect(band?.options?.[0]).toEqual({
      id: 'yield',
      say: 'Yield and live.',
      check: [{ ability: 'persuasion', dc: 10 }],
      success: [{ say: 'We yield.', fact: 'band-yielded' }],
    });
  });

  it('writes the lines back as the file had them', () => {
    const read = opened(survivorsWalkYaml);
    const saved = parse(
      exportDraftYaml({ draft: read.draft, scope: read.scope }, read.key)
    ) as { factions: unknown[] };
    const source = parse(survivorsWalkYaml) as { factions: unknown[] };
    expect(saved.factions).toEqual(source.factions);
  });

  it('refuses an empty list with the engine’s sentence', () => {
    expect(() => validateSiteFactions([{ id: 'band', options: [] }])).toThrow(
      `Site faction at index 0 options: ${OPTIONS_EMPTY_REFUSAL}`
    );
    expect(OPTIONS_EMPTY_REFUSAL).toBe(
      '`options` lists nothing — omit it, or write a line it can be spoken to with'
    );
    const file = parse(survivorsWalkYaml) as {
      factions: { options?: unknown[] }[];
    };
    file.factions[0]!.options = [];
    const read = readDraftYaml(stringify(file));
    expect(read.ok).toBe(false);
  });

  it('judges each line by the one option grammar', () => {
    expect(() =>
      validateSiteFactions([
        { id: 'band', options: [{ id: 'yield', check: [] }] },
      ])
    ).toThrow('the option does not say what the character says');
  });

  it('adds and removes a line; removing the last leaves the key absent', () => {
    const scope = { factions: [{ id: 'band' }] };
    const added = addSiteFactionOption(scope, 'band');
    expect(added.factions?.[0]?.options).toHaveLength(1);
    const removed = removeSiteFactionOption(added, 'band', 0);
    expect(removed.factions?.[0]).toEqual({ id: 'band' });
  });

  it('the Read back says a member with no lines speaks the faction’s', () => {
    const read = opened(survivorsWalkYaml);
    const paragraphs = readBackOf(
      { draft: read.draft, scope: read.scope },
      { kind: 'creature', id: 'follower-2' }
    );
    const spoken = paragraphs.find((p) => p.heading === 'spoken-to');
    expect(spoken?.sentences.map((s) => s.text)).toEqual([
      'It can be spoken to.',
      'It has no lines of its own, so it speaks the band faction’s.',
    ]);
    expect(spoken?.items?.map((s) => s.text)).toEqual([
      '“Yield and live.” Persuasion DC 10. Success: “We yield.”, and the speaker learns band-yielded.',
      '“Throw down your arms.” Intimidation DC 15. Failure: “We fight on.”',
    ]);
  });
});
