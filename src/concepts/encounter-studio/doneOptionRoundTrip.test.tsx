/**
 * A LINE DONE ROUND-TRIPS (rpg-project#959). A prop's option may `do:` in
 * place of `say:` (seen, not heard), with `seen:` for a witness. The studio
 * loads it, shows it as something DONE (never as a line with empty words),
 * keeps it through every edit around it, and writes it back byte for byte.
 *
 * The served castle carries them: the grate's two ways and the altar's
 * examine are deeds (rpg-api#1243).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { setConcealment } from '../world-building/concealmentEdits';
import {
  asDone,
  asSaid,
  isDoneOption,
  patchOption,
  withSeen,
} from '../world-building/optionEdits';
import { setPropOption } from '../world-building/propBindingEdits';
import { OptionsEditor } from '../world-building/SitePolicies';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';

afterEach(cleanup);

const DONE =
  '            do: You lift the grate and take the way up.\n' +
  '            seen: lifts the grate by the hearth and climbs down into the dark\n';
const castle = served;

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}
type Read = ReturnType<typeof read>;
type Draft = Read['draft'];
type Option = NonNullable<
  NonNullable<Draft['room']['propBindings']>[string]['options']
>[number];

function changedLines(a: string, b: string): string[] {
  const left = a.split('\n');
  return b.split('\n').filter((line, i) => line !== left[i]);
}

const save = (result: Read, draft: Draft, scope = result.scope) =>
  exportDraftYaml({ draft, scope }, result.key);

function grateEdit(
  result: Read,
  index: number,
  change: (option: Option) => Option
): string {
  const draft = structuredClone(result.draft);
  const grate = draft.room.propBindings!.grate;
  draft.room.propBindings!.grate = setPropOption(
    grate,
    index,
    change(grate.options![index]!)
  )!;
  return save(result, draft);
}

describe('a line done loads and writes back (rpg-project#959)', () => {
  it('the castle with a deed loads, reads it as done, and writes back byte for byte', () => {
    expect(castle).toContain(DONE);
    const result = read(castle);
    expect(save(result, result.draft)).toBe(castle);
    const option = result.draft.room.propBindings!.grate.options![0]!;
    expect(option).not.toHaveProperty('say');
    expect(option.do).toBe('You lift the grate and take the way up.');
    expect(option.seen).toBe(
      'lifts the grate by the hearth and climbs down into the dark'
    );
    expect(isDoneOption(option)).toBe(true);
  });

  it('an option with neither `say` nor `do` is still refused, in the engine’s words', () => {
    const neither = served.replace(
      '            do: You lift the grate and take the way up.\n',
      ''
    );
    const result = readDraftYaml(neither);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.refusal).toContain(
        'the option does not say what the character says'
      );
  });

  it('renaming the deed keeps `do`, `seen` and its relocate', () => {
    const result = read(castle);
    const saved = grateEdit(result, 0, (o) =>
      patchOption(o, { id: 'up-the-tunnel' })
    );
    expect(changedLines(castle, saved)).toEqual([
      '          - id: up-the-tunnel',
    ]);
    expect(saved).toContain(DONE);
  });

  it('editing the line beside it keeps the deed byte for byte', () => {
    const result = read(castle);
    const saved = grateEdit(result, 1, (o) =>
      withSeen(o, 'drops out of sight')
    );
    expect(changedLines(castle, saved)).toEqual([
      '            seen: drops out of sight',
    ]);
    expect(saved).toContain(DONE);
  });

  it('editing the concealment keeps the deed', () => {
    const result = read(castle);
    const scope = setConcealment(result.scope, 'kitchen-passage', {
      ...result.scope.concealments!['kitchen-passage']!,
      checks: [{ ability: 'investigation', dc: 20 }],
    });
    const saved = save(result, result.draft, scope);
    expect(changedLines(castle, saved)).toEqual([
      '    checks: [{ ability: investigation, dc: 20 }]',
    ]);
    expect(saved).toContain(DONE);
  });

  it('editing the seen words changes that line only', () => {
    const result = read(castle);
    const saved = grateEdit(result, 0, (o) =>
      withSeen(o, 'vanishes down the grate.')
    );
    expect(changedLines(castle, saved)).toEqual([
      '            seen: vanishes down the grate.',
    ]);
  });

  it('done → said moves the words to `say` and drops `seen`; said → done moves them back', () => {
    const result = read(served);
    const said = grateEdit(result, 0, (o) => asSaid(o));
    expect(said).toContain(
      '          - id: to-chapel\n            say: You lift the grate and take the way up.\n'
    );
    const option = parse(said).room.room.propBindings.grate.options[0];
    expect(option).not.toHaveProperty('do');
    expect(option).not.toHaveProperty('seen');
    const again = read(said);
    const back = grateEdit(again, 0, (o) => asDone(o));
    // Back to done: the words return to `do`; the seen words were the said
    // line's to drop, so they are the one line not restored.
    expect(back).toBe(
      served.replace(
        '            seen: lifts the grate by the hearth and climbs down into the dark\n            success:\n              - relocate:\n                  to: region-chapel',
        '            success:\n              - relocate:\n                  to: region-chapel'
      )
    );
  });
});

describe('the studio shows a deed as done', () => {
  it('a Done toggle, the doer’s words and the seen words, never an empty line', () => {
    const result = read(castle);
    const onChange = vi.fn();
    render(
      <OptionsEditor
        owner="grate"
        options={result.draft.room.propBindings!.grate.options!}
        room={result.draft.room}
        isProp
        onAdd={vi.fn()}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    );
    expect(
      (screen.getByLabelText('Line 1 of grate is done') as HTMLInputElement)
        .checked
    ).toBe(true);
    expect(
      (screen.getByLabelText('Line 1 does for grate') as HTMLTextAreaElement)
        .value
    ).toBe('You lift the grate and take the way up.');
    expect(
      (screen.getByLabelText('Line 1 seen as for grate') as HTMLTextAreaElement)
        .value
    ).toBe('lifts the grate by the hearth and climbs down into the dark');
    expect(screen.queryByLabelText('Line 1 for grate')).toBeNull();
    // Turning the line beside it into a line said moves its words to `say`.
    expect(
      (screen.getByLabelText('Line 2 of grate is done') as HTMLInputElement)
        .checked
    ).toBe(true);
    fireEvent.click(screen.getByLabelText('Line 2 of grate is said'));
    expect(onChange).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({
        say: 'You lift the grate and take the way down.',
      })
    );
    expect(onChange.mock.lastCall![1]).not.toHaveProperty('do');
  });
});
