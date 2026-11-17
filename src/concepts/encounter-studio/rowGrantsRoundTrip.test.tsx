/**
 * A ROW'S GRANT AND A LINE'S LOUDNESS, FROM THE FORM (rpg-project#975 A).
 * A line's success or failure row grants one thing — a topic recognised
 * (`recognize`), a record told (`tells`) or a relocation (`relocate`) — and
 * a line, a row and a heard voice carry a loudness. Each is authored through
 * the form on the castle and written back as the exact YAML the engine
 * reads; the castle still downloads byte for byte unedited, and editing one
 * of them changes no other key's bytes.
 *
 * What the engine refuses the form cannot write: one grant per row (one
 * select), no recognition on a prop's line (not offered), grants only on a
 * line's verdict rows (a table row has no Grants), `heard_by` only on a line
 * that names a conversation, a done line has no loudness, a heard loudness
 * only on a voice.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OptionShape } from '../world-building/answerTableShape';
import {
  SiteNamesContext,
  siteNamesOf,
  type SiteNames,
} from '../world-building/siteNames';
import { AnswerEntryRow, OptionsEditor } from '../world-building/SitePolicies';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { placeName } from './placeName';
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
  const right = b.split('\n');
  return right.filter((line, i) => line !== left[i]);
}

/** Render one creature's or prop's lines inside the site's names, and
 * return the option the last edit wrote. */
function editor(
  result: Read,
  owner: string,
  kind: 'creature' | 'prop'
): { last: () => { index: number; option: OptionShape } } {
  const room = result.draft.room;
  const options =
    kind === 'creature'
      ? room.monsterBindings![owner]!.options!
      : room.propBindings![owner]!.options!;
  const onChange = vi.fn();
  const names: SiteNames = siteNamesOf(result.scope, result.draft.room);
  // The lines held in state, as their owner holds them: an edit is shown,
  // so the fields a choice opens can be edited next.
  function Harness() {
    const [shown, setShown] = useState<readonly OptionShape[]>(options);
    return (
      <OptionsEditor
        owner={owner}
        at={
          kind === 'creature'
            ? `room.room.monsterBindings.${owner}`
            : `room.room.propBindings.${owner}`
        }
        options={shown}
        room={room}
        isProp={kind === 'prop'}
        onAdd={vi.fn()}
        onChange={(index, option) => {
          onChange(index, option);
          setShown((was) => was.map((o, i) => (i === index ? option : o)));
        }}
        onRemove={vi.fn()}
      />
    );
  }
  render(
    <SiteNamesContext.Provider value={names}>
      <Harness />
    </SiteNamesContext.Provider>
  );
  return {
    last: () => {
      const call = onChange.mock.calls.at(-1)!;
      return { index: call[0] as number, option: call[1] as OptionShape };
    },
  };
}

/** The castle with one creature's or prop's line replaced, written out. */
function saveWith(
  result: Read,
  owner: string,
  kind: 'creature' | 'prop',
  index: number,
  option: OptionShape
): string {
  const draft = structuredClone(result.draft);
  const binding =
    kind === 'creature'
      ? draft.room.monsterBindings![owner]!
      : draft.room.propBindings![owner]!;
  const options = [...binding.options!];
  options[index] = option as (typeof options)[number];
  binding.options = options;
  return exportDraftYaml({ draft, scope: result.scope }, result.key);
}

const row = 'line 1 of scullion success';
const grants = (label: string) =>
  screen.getByLabelText(`Grants for ${label} entry`) as HTMLSelectElement;

describe('the castle still downloads byte for byte', () => {
  it('unedited, with its tells, relocates, recognitions and loudnesses', () => {
    const result = read(served);
    expect(
      exportDraftYaml({ draft: result.draft, scope: result.scope }, result.key)
    ).toBe(served);
  });
});

describe('a row grants one thing, from the form (rpg-project#975 A)', () => {
  it('a record told: the scullion’s row shows `kitchen-way`; picking another writes that one line', () => {
    const result = read(served);
    const { last } = editor(result, 'scullion', 'creature');
    expect(grants(row).value).toBe('tells');
    const record = screen.getByLabelText(
      `Record for ${row} entry`
    ) as HTMLSelectElement;
    expect(record.value).toBe('kitchen-way');
    fireEvent.change(record, { target: { value: 'cooks-ledger' } });
    const { index, option } = last();
    const saved = saveWith(result, 'scullion', 'creature', index, option);
    expect(changedLines(served, saved)).toEqual([
      '                tells: cooks-ledger',
    ]);
  });

  it('switching the grant to a relocation replaces the record with one relocate', () => {
    const result = read(served);
    const { last } = editor(result, 'scullion', 'creature');
    fireEvent.change(grants(row), { target: { value: 'relocate' } });
    let { index, option } = last();
    expect(option.success![0]).not.toHaveProperty('tells');
    // One relocation form: region, words, rounds.
    cleanup();
    const after = read(saveWith(result, 'scullion', 'creature', index, option));
    const second = editor(after, 'scullion', 'creature');
    fireEvent.change(screen.getByLabelText(`Region for ${row} entry`), {
      target: { value: 'region-cells' },
    });
    ({ index, option } = second.last());
    cleanup();
    const third = read(saveWith(after, 'scullion', 'creature', index, option));
    const t = editor(third, 'scullion', 'creature');
    fireEvent.change(screen.getByLabelText(`Words for ${row} entry`), {
      target: { value: 'You are shoved down a chute.' },
    });
    ({ index, option } = t.last());
    cleanup();
    const fourth = read(saveWith(third, 'scullion', 'creature', index, option));
    const f = editor(fourth, 'scullion', 'creature');
    fireEvent.change(screen.getByLabelText(`Rounds for ${row} entry`), {
      target: { value: '2' },
    });
    ({ index, option } = f.last());
    const saved = saveWith(fourth, 'scullion', 'creature', index, option);
    expect(saved).toBe(
      served.replace(
        '                tells: kitchen-way\n',
        '                relocate:\n' +
          '                  to: region-cells\n' +
          '                  words: You are shoved down a chute.\n' +
          '                  rounds: 2\n'
      )
    );
  });

  it('a recognition: topic, about, holder written as the engine reads it; witnesses only on a line that names a conversation', () => {
    const result = read(served);
    const { last } = editor(result, 'scullion', 'creature');
    fireEvent.change(grants(row), { target: { value: 'recognize' } });
    let { index, option } = last();
    cleanup();
    const after = read(saveWith(result, 'scullion', 'creature', index, option));
    const second = editor(after, 'scullion', 'creature');
    // The favour names no conversation: nobody else can hear it.
    expect(
      (
        screen.getByLabelText(
          `Also held by the conversation’s carriers who witness it, for ${row} entry`
        ) as HTMLInputElement
      ).disabled
    ).toBe(true);
    fireEvent.change(screen.getByLabelText(`Topic for ${row} entry`), {
      target: { value: 'kitchen-friend' },
    });
    ({ index, option } = second.last());
    cleanup();
    const third = read(saveWith(after, 'scullion', 'creature', index, option));
    const t = editor(third, 'scullion', 'creature');
    fireEvent.change(screen.getByLabelText(`About for ${row} entry`), {
      target: { value: 'speaker' },
    });
    ({ index, option } = t.last());
    const saved = saveWith(third, 'scullion', 'creature', index, option);
    expect(saved).toBe(
      served.replace(
        '                tells: kitchen-way\n',
        '                recognize:\n' +
          '                  topic: kitchen-friend\n' +
          '                  holder: spoken_to\n' +
          '                  about: speaker\n'
      )
    );
  });

  it('the gate guard’s recognition reads as written, its witnesses checked (its line names the gate)', () => {
    const result = read(served);
    editor(result, 'gate-1', 'creature');
    // gate-1's second line (`straggler`) grants on both verdicts.
    const label = 'line 2 of gate-1 success';
    expect(grants(label).value).toBe('recognize');
    expect(
      (screen.getByLabelText(`Topic for ${label} entry`) as HTMLInputElement)
        .value
    ).toBe('admitted');
    expect(
      (screen.getByLabelText(`About for ${label} entry`) as HTMLSelectElement)
        .value
    ).toBe('speaker');
    const heard = screen.getByLabelText(
      `Also held by the conversation’s carriers who witness it, for ${label} entry`
    ) as HTMLInputElement;
    expect(heard.disabled).toBe(false);
    expect(heard.checked).toBe(true);
  });

  it('a new recognition on a line that requires a conversation can be witnessed: friends-inside', () => {
    const result = read(served);
    const options = result.draft.room.monsterBindings!['gate-1']!.options!;
    const at = options.findIndex((o) => o.id === 'friends-inside');
    const label = `line ${at + 1} of gate-1 success`;
    const { last } = editor(result, 'gate-1', 'creature');
    fireEvent.change(grants(label), { target: { value: 'recognize' } });
    const witnesses = screen.getByLabelText(
      `Also held by the conversation’s carriers who witness it, for ${label} entry`
    ) as HTMLInputElement;
    expect(witnesses.disabled).toBe(false);
    fireEvent.click(witnesses);
    const { option } = last();
    expect(option.success![0]).toMatchObject({
      recognize: { heard_by: 'carriers_who_witnessed' },
    });
  });

  it('a prop’s line offers no recognition (a prop holds nothing about anybody); its relocate reads as written', () => {
    const result = read(served);
    editor(result, 'grate', 'prop');
    const label = 'line 1 of grate success';
    const offered = [...grants(label).options].map((o) => o.value);
    expect(offered).toEqual(['', 'tells', 'relocate']);
    expect(grants(label).value).toBe('relocate');
    expect(
      (screen.getByLabelText(`Region for ${label} entry`) as HTMLSelectElement)
        .value
    ).toBe('region-chapel');
    expect(
      (screen.getByLabelText(`Rounds for ${label} entry`) as HTMLInputElement)
        .value
    ).toBe('1');
  });

  it('editing the relocation’s words changes that line only', () => {
    const result = read(served);
    const { last } = editor(result, 'grate', 'prop');
    fireEvent.change(
      screen.getByLabelText('Words for line 1 of grate success entry'),
      { target: { value: 'Up you go.' } }
    );
    const { index, option } = last();
    expect(
      changedLines(served, saveWith(result, 'grate', 'prop', index, option))
    ).toEqual(['                  words: Up you go.']);
  });

  it('choosing Nothing takes the grant away and keeps the row’s words', () => {
    const result = read(served);
    const { last } = editor(result, 'scullion', 'creature');
    fireEvent.change(grants(row), { target: { value: '' } });
    const { index, option } = last();
    expect(saveWith(result, 'scullion', 'creature', index, option)).toBe(
      served.replace('                tells: kitchen-way\n', '')
    );
  });

  it('a table row has no Grants: a table row grants nothing', () => {
    render(
      <ul>
        <AnswerEntryRow
          trigger="time"
          entry={{ toward: 'enemy' }}
          onCommit={vi.fn()}
          onRemove={vi.fn()}
        />
      </ul>
    );
    expect(screen.queryByLabelText('Grants for time entry')).toBeNull();
  });
});

describe('a loudness, from the form (rpg-project#975 A)', () => {
  it('a line’s loudness: the pedlar’s hail reads Shout; Whisper writes that one line; Speak removes it', () => {
    const result = read(served);
    const options = result.draft.room.monsterBindings!.pedlar!.options!;
    const n = options.findIndex((o) => o.id === 'hail-the-pedlar') + 1;
    const { last } = editor(result, 'pedlar', 'creature');
    const loudness = screen.getByLabelText(
      `Line ${n} loudness for pedlar`
    ) as HTMLSelectElement;
    expect(loudness.value).toBe('shout');
    fireEvent.change(loudness, { target: { value: 'whisper' } });
    let { index, option } = last();
    expect(
      changedLines(
        served,
        saveWith(result, 'pedlar', 'creature', index, option)
      )
    ).toEqual(['            loudness: whisper']);
    fireEvent.change(loudness, { target: { value: '' } });
    ({ index, option } = last());
    expect(saveWith(result, 'pedlar', 'creature', index, option)).toBe(
      served.replace(
        '            say: Oi! Pedlar! What have you got to sell?\n            loudness: shout\n',
        '            say: Oi! Pedlar! What have you got to sell?\n'
      )
    );
  });

  it('a line’s first loudness lands right after `say`, not at the end of the line', () => {
    const result = read(served);
    const { last } = editor(result, 'scullion', 'creature');
    fireEvent.change(screen.getByLabelText('Line 1 loudness for scullion'), {
      target: { value: 'shout' },
    });
    const { index, option } = last();
    expect(saveWith(result, 'scullion', 'creature', index, option)).toBe(
      served.replace(
        "            say: There's a coin in it if you know a way out of here.\n            requires:\n              holds: purse\n            success:\n              - say: The grate by the hearth.",
        "            say: There's a coin in it if you know a way out of here.\n            loudness: shout\n            requires:\n              holds: purse\n            success:\n              - say: The grate by the hearth."
      )
    );
  });

  it('a line done has no loudness: something done is seen, not heard', () => {
    const result = read(served);
    editor(result, 'grate', 'prop');
    expect(screen.queryByLabelText('Line 1 loudness for grate')).toBeNull();
  });

  it('a row’s loudness: a shouted answer reads Shout; Scream writes that one line', () => {
    const result = read(served);
    const options = result.draft.room.monsterBindings!['gate-1']!.options!;
    const at = options.findIndex((o) => o.id === 'friends-inside');
    const label = `line ${at + 1} of gate-1 success`;
    const { last } = editor(result, 'gate-1', 'creature');
    const loudness = screen.getByLabelText(
      `Loudness for ${label} entry`
    ) as HTMLSelectElement;
    expect(loudness.value).toBe('shout');
    fireEvent.change(loudness, { target: { value: 'scream' } });
    const { index, option } = last();
    const saved = saveWith(result, 'gate-1', 'creature', index, option);
    expect(changedLines(served, saved)).toEqual([
      '                loudness: scream',
    ]);
  });

  it('a heard voice’s “at least” offers what the engine means: Any, Speak, Shout, Scream (Whisper is Any)', () => {
    render(
      <ul>
        <AnswerEntryRow
          trigger="time"
          entry={{
            when: { heard: { kind: 'voice', within: 3 } },
            toward: 'sound',
          }}
          onCommit={vi.fn()}
          onRemove={vi.fn()}
        />
      </ul>
    );
    const select = screen.getByLabelText(
      'Heard loudness for time entry'
    ) as HTMLSelectElement;
    expect([...select.options].map((o) => [o.value, o.text])).toEqual([
      ['', 'Any'],
      ['speak', 'Speak'],
      ['shout', 'Shout'],
      ['scream', 'Scream'],
    ]);
  });

  it('a heard voice’s loudness: offered on a voice only, kept in its place, dropped with the voice', () => {
    const onCommit = vi.fn();
    render(
      <ul>
        <AnswerEntryRow
          trigger="time"
          entry={{
            when: { heard: { kind: 'voice', within: 3, loudness: 'shout' } },
            toward: 'sound',
          }}
          onCommit={onCommit}
          onRemove={vi.fn()}
        />
      </ul>
    );
    const condition = screen.getByRole('group', {
      name: 'Condition for time entry',
    });
    const loudness = within(condition).getByLabelText(
      'Heard loudness for time entry'
    ) as HTMLSelectElement;
    expect(loudness.value).toBe('shout');
    fireEvent.change(loudness, { target: { value: 'scream' } });
    expect(onCommit.mock.calls.at(-1)![0].when).toEqual({
      heard: { kind: 'voice', within: 3, loudness: 'scream' },
    });
    expect(
      Object.keys(onCommit.mock.calls.at(-1)![0].when.heard as object)
    ).toEqual(['kind', 'within', 'loudness']);
    fireEvent.change(within(condition).getByLabelText('Sound for time entry'), {
      target: { value: 'clang' },
    });
    expect(onCommit.mock.calls.at(-1)![0].when).toEqual({
      heard: { kind: 'clang', within: 3 },
    });
  });
});

describe('each new field is a place a jump lands on, named in words', () => {
  it('the record, the relocation and the loudnesses register by their paths', () => {
    const result = read(served);
    render(
      <RevealProvider>
        <SiteNamesContext.Provider
          value={siteNamesOf(result.scope, result.draft.room)}
        >
          <OptionsEditor
            owner="scullion"
            at="room.room.monsterBindings.scullion"
            options={result.draft.room.monsterBindings!.scullion!.options!}
            room={result.draft.room}
            isProp={false}
            onAdd={vi.fn()}
            onChange={vi.fn()}
            onRemove={vi.fn()}
          />
        </SiteNamesContext.Provider>
      </RevealProvider>
    );
    for (const path of [
      'room.room.monsterBindings.scullion.options[0].success[0].tells',
      'room.room.monsterBindings.scullion.options[0].success[0].loudness',
      'room.room.monsterBindings.scullion.options[0].loudness',
    ])
      expect(
        document.querySelector(`[data-reveal-key="path:${path}"]`)
      ).not.toBeNull();
  });

  it('placeName says them', () => {
    const result = read(served);
    const document = { draft: result.draft, scope: result.scope };
    expect(
      placeName(
        'room.room.propBindings.grate.options[0].success[0].relocate.words',
        document
      )
    ).toBe('grate · line `to-chapel` · on a win · relocate · words');
    expect(
      placeName(
        'room.room.monsterBindings.scullion.options[0].success[0].tells',
        document
      )
    ).toBe('scullion · line `favour` · on a win · tells');
    expect(
      placeName(
        'room.room.monsterBindings.scullion.options[0].loudness',
        document
      )
    ).toBe('scullion · line `favour` · loudness');
  });
});
