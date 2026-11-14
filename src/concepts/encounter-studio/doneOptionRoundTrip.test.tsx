/**
 * A LINE DONE ROUND-TRIPS (rpg-project#959). A prop's option may `do:` in
 * place of `say:` (seen, not heard), with `seen:` for a witness. The studio
 * loads it, shows it as something DONE (never as a line with empty words),
 * keeps it through every edit around it, and writes it back byte for byte.
 *
 * Until the served castle carries one, the grate's `to-chapel` line is made
 * a deed here, by text, from the served castle.
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

const SAID = '            say: (lift the grate and take the way up)\n';
const DONE =
  '            do: You lift the grate and take the way up.\n' +
  '            seen: lifts the grate and climbs in.\n';
const castle = served.replace(SAID, DONE);

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
    expect(option.seen).toBe('lifts the grate and climbs in.');
    expect(isDoneOption(option)).toBe(true);
  });

  it('an option with neither `say` nor `do` is still refused, in the engine’s words', () => {
    const neither = served.replace(SAID, '');
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
      patchOption(o, { say: '(climb down)' })
    );
    expect(changedLines(castle, saved)).toEqual([
      '            say: (climb down)',
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

  it('said ↔ done moves the words and nothing else; both ways round-trip', () => {
    const result = read(served);
    const done = grateEdit(result, 0, (o) => asDone(o));
    expect(done).toContain(
      '          - id: to-chapel\n            do: (lift the grate and take the way up)\n'
    );
    expect(
      parse(done).room.room.propBindings.grate.options[0]
    ).not.toHaveProperty('say');
    const again = read(done);
    const back = grateEdit(again, 0, (o) => asSaid(o));
    expect(back).toBe(served);
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
    ).toBe('lifts the grate and climbs in.');
    expect(screen.queryByLabelText('Line 1 for grate')).toBeNull();
    // The line beside it is still said.
    expect(
      (screen.getByLabelText('Line 2 of grate is said') as HTMLInputElement)
        .checked
    ).toBe(true);
    fireEvent.click(screen.getByLabelText('Line 2 of grate is done'));
    expect(onChange).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ do: '(lift the grate and take the way down)' })
    );
    expect(onChange.mock.lastCall![1]).not.toHaveProperty('say');
  });
});
