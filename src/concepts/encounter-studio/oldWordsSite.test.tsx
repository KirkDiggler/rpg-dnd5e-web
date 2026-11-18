/**
 * A FILE IN THE OLD WORDS STILL OPENS (rpg-project#1005). The noted words
 * retired `recognized`, `recognize: { topic, holder }`, a line's `holds:
 * <prop>` and a state's `holds:` post. The studio LOADS WHAT RUNS and keeps
 * what it does not know: a file written before the rename loads, every old
 * key is kept as written and shown as written, an unedited download is byte
 * for byte the file, and an edit of a neighbour changes only its own line.
 * The studio never rewrites the author's words; the engine's validate-only
 * check refuses the file and names the word that replaced each one.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import type { OptionShape } from '../world-building/answerTableShape';
import {
  giveOf,
  outcomeKindOf,
  outcomesOf,
} from '../world-building/interactionOutcomes';
import { SiteNamesContext, siteNamesOf } from '../world-building/siteNames';
import { OptionsEditor } from '../world-building/SitePolicies';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import old from './fixtures/old-words-site.yaml?raw';
import { refusalJumps } from './refusalJump';
import { RevealProvider } from './reveal';

afterEach(cleanup);

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}
type Read = ReturnType<typeof read>;

function changedLines(a: string, b: string): string[] {
  const left = a.split('\n');
  return b.split('\n').filter((line, i) => line !== left[i]);
}

/** The engine's refusals of this file, verbatim (encounter v0.222.1,
 * `go run ./cmd/readback` on `old-words-site.yaml`). The engine stops at the
 * first; the next two are what it says once each earlier word is fixed. */
const ENGINE_REFUSAL =
  'line 27: `recognize` is now `give`: write give: { topic: <topic>, to: spoken_to, about: party_in_sight|speaker, heard_by: carriers_who_witnessed }';
const ENGINE_REFUSALS = [
  ENGINE_REFUSAL,
  'line 98: state "posted": line 2: a state\'s `holds` is now `post`: write post: { door: <door id>, at, against, pass }',
  "line 104: `recognized` is now `noted`: write { noted: <topic> } (what the creature spoken to, or a post's holder, has noted about the speaker or the walker)",
];

function editor(result: Read): () => { index: number; option: OptionShape } {
  const room = result.draft.room;
  const initial = room.monsterBindings!['front-goblin']!.options!;
  let last: { index: number; option: OptionShape } | undefined;
  function Harness() {
    const [options, setOptions] = useState<readonly OptionShape[]>(initial);
    return (
      <OptionsEditor
        owner="front-goblin"
        at="room.room.monsterBindings.front-goblin"
        options={options}
        room={room}
        isProp={false}
        onAdd={vi.fn()}
        onChange={(index, option) => {
          last = { index, option };
          setOptions((was) => was.map((o, i) => (i === index ? option : o)));
        }}
        onRemove={vi.fn()}
      />
    );
  }
  render(
    <RevealProvider>
      <SiteNamesContext.Provider value={siteNamesOf(result.scope, room)}>
        <Harness />
      </SiteNamesContext.Provider>
    </RevealProvider>
  );
  return () => last!;
}

describe('a file in the old words (rpg-project#1005)', () => {
  it('loads, keeps every old key, and an unedited download is byte-identical', () => {
    const result = read(old);
    expect(exportDraftYaml(result, result.key)).toBe(old);
    const goblin = result.draft.room.monsterBindings!['front-goblin']!;
    const [vouch, bribe] = goblin.options! as unknown as Record<
      string,
      unknown
    >[];
    expect(vouch!.requires).toEqual([{ recognized: 'admitted' }]);
    expect((vouch!.success as Record<string, unknown>[])[0]!.recognize).toEqual(
      { topic: 'admitted', holder: 'spoken_to', about: 'speaker' }
    );
    // `holds` once meant carrying; it is read under its new meaning now and
    // kept as written: the engine points the author at `carries`.
    expect(bribe!.requires).toEqual({ holds: 'prop-1' });
    expect(
      (goblin.states as Record<string, Record<string, unknown>>).posted!.holds
    ).toEqual({ door: 'cellar-door', against: 'entering' });
    const outcome = outcomesOf(result.scope, 'front-gate').admitted![0];
    expect(outcome).toEqual({
      recognize: {
        topic: 'admitted',
        holder: 'spoken_to',
        about: 'party_in_sight',
      },
    });
    // The outcomes form does not read it as a give: it is shown as written.
    expect(outcomeKindOf(outcome)).toBeUndefined();
    expect(giveOf(outcome)).toBeUndefined();
  });

  it('an edit of a neighbour changes its own line, and every old word survives', () => {
    const result = read(old);
    const last = editor(result);
    fireEvent.change(screen.getByLabelText('Line 3 for front-goblin'), {
      target: { value: 'Where is the cellar?' },
    });
    const { index, option } = last();
    const draft = structuredClone(result.draft);
    const binding = draft.room.monsterBindings!['front-goblin']!;
    const options = [...binding.options!];
    options[index] = option as (typeof options)[number];
    binding.options = options;
    const saved = exportDraftYaml({ draft, scope: result.scope }, result.key);
    expect(changedLines(old, saved)).toEqual([
      '            say: Where is the cellar?',
    ]);
    expect(parse(saved).interactions).toEqual(parse(old).interactions);
    expect(saved).toContain('              - recognized: admitted\n');
    expect(saved).toContain(
      '                recognize:\n                  topic: admitted\n                  holder: spoken_to\n'
    );
    expect(saved).toContain('              holds: prop-1\n');
    expect(saved).toContain(
      '            holds: { door: cellar-door, against: entering }\n'
    );
    expect(saved).toContain(
      '        - recognize:\n            topic: admitted\n'
    );
  });

  it('the form shows an old word as written and never rewrites it', () => {
    const result = read(old);
    editor(result);
    // The retired requirement: its own key in the select, its words as
    // written beside it.
    expect(
      (
        screen.getByLabelText(
          'Line 1 requires for front-goblin'
        ) as HTMLSelectElement
      ).value
    ).toBe('recognized');
    expect(
      screen.getByLabelText('Line 1 requires as written for front-goblin')
        .textContent
    ).toBe('recognized: admitted — kept as written');
    // The retired row grant: said so, and no give is invented.
    expect(
      (
        screen.getByLabelText(
          'Grants for line 1 of front-goblin success entry'
        ) as HTMLSelectElement
      ).value
    ).toBe('');
    expect(
      screen.getByLabelText(
        'Written as recognize in line 1 of front-goblin success entry'
      )
    ).toBeTruthy();
    // `holds: prop-1` (carrying, before the rename) is retired too: its own
    // key, as written.
    expect(
      (
        screen.getByLabelText(
          'Line 2 requires for front-goblin'
        ) as HTMLSelectElement
      ).value
    ).toBe('holds');
    expect(
      screen.getByLabelText('Line 2 requires as written for front-goblin')
        .textContent
    ).toBe('holds: prop-1 — kept as written');
  });

  it.each(ENGINE_REFUSALS)(
    'the engine’s refusal is shown in its own words: %s',
    (message) => {
      const result = read(old);
      const [jump] = refusalJumps([{ path: '', message }], {
        draft: result.draft,
        scope: result.scope,
      });
      expect(jump).toEqual({ path: '', message, target: null });
    }
  );
});
