/**
 * STATUSES THE STUDIO DOES NOT AUTHOR RIDE THROUGH AN EDIT (rpg-project#1024).
 * The served castle writes a `statuses:` section (warmed-up, and feasted with
 * its `when_given` heal) and two cook's lines whose success rows give them
 * (`apply_status: warmed-up` on help, `apply_status: feasted` on taste). The
 * studio has no form for either; an edit elsewhere, or to those very lines,
 * writes them back unchanged.
 */
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { linesOf } from '../world-building/answerTableShape';
import { normalizeBinding } from '../world-building/monsterOrderEdits';
import { patchOption } from '../world-building/optionEdits';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

/** The castle's `statuses:` section, as written. */
function statusesOf(text: string): unknown {
  return parse(text).statuses;
}

/** One of the cook's lines, as written. */
function lineOf(text: string, id: string): unknown {
  const cook = parse(text).room.room.monsterBindings.cook;
  return cook.options.find((o: { id: string }) => o.id === id);
}

describe('the castle’s statuses survive the studio (rpg-project#1024)', () => {
  it('precondition: the served castle writes both statuses and the lines that give them', () => {
    expect(statusesOf(served)).toHaveProperty(
      ['warmed-up', 'name'],
      'Warmed up'
    );
    expect(statusesOf(served)).toHaveProperty(
      ['feasted', 'when_given', 0, 'heal'],
      2
    );
    expect(lineOf(served, 'help')).toHaveProperty(
      ['success', 0, 'apply_status'],
      { status: 'warmed-up', to: 'speaker' }
    );
    expect(lineOf(served, 'taste')).toHaveProperty(
      ['success', 0, 'apply_status'],
      { status: 'feasted', to: 'speaker' }
    );
  });

  it('moving the pedlar keeps the statuses section and the cook’s lines unchanged', () => {
    const result = read(served);
    const draft = structuredClone(result.draft);
    draft.room.monsterDeclarations.find(
      (m) => m.id === 'pedlar'
    )!.startingCell!.location.q += 1;
    const saved = exportDraftYaml({ draft, scope: result.scope }, result.key);
    expect(saved).not.toBe(served);
    expect(statusesOf(saved)).toEqual(statusesOf(served));
    expect(lineOf(saved, 'help')).toEqual(lineOf(served, 'help'));
    expect(lineOf(saved, 'taste')).toEqual(lineOf(served, 'taste'));
  });

  it('rewording the cook’s help and taste lines keeps each apply_status', () => {
    const result = read(served);
    const room = result.draft.room;
    const cook = room.monsterBindings!['cook'];
    const reworded: Record<string, string> = {
      help: '(roll out the pastry)',
      taste: '(try a pie)',
    };
    const options = linesOf(cook.options).map((o) =>
      reworded[o.id] ? patchOption(o, { say: reworded[o.id] }) : o
    );
    const draft = {
      ...result.draft,
      room: {
        ...room,
        monsterBindings: {
          ...room.monsterBindings,
          cook: normalizeBinding({ ...cook, options })!,
        },
      },
    };
    const saved = exportDraftYaml({ draft, scope: result.scope }, result.key);
    expect(statusesOf(saved)).toEqual(statusesOf(served));
    for (const id of ['help', 'taste'])
      expect(lineOf(saved, id)).toEqual({
        ...(lineOf(served, id) as object),
        say: reworded[id],
      });
  });

  // The hold (rpg-project#990): `held` takes away moving and ends when a
  // fight starts, and the hall guard's push-past line gives it on a failure.
  const pushPastOf = (text: string): unknown =>
    parse(text).room.room.monsterBindings['hall-1'].options.find(
      (o: { id: string }) => o.id === 'push-past'
    );

  it('precondition: the served castle writes the hold and the line that gives it', () => {
    expect(statusesOf(served)).toHaveProperty(
      ['held', 'changes', 0, 'cannot'],
      ['move']
    );
    expect(statusesOf(served)).toHaveProperty(
      ['held', 'maintenance', 0, 'ends_on'],
      'fight starts'
    );
    expect(pushPastOf(served)).toHaveProperty(['failure', 0, 'apply_status'], {
      status: 'held',
      to: 'party_in_sight',
    });
  });

  it('rewording the push-past line, and moving the pedlar, keep cannot: [move] and ends_on: fight starts', () => {
    const result = read(served);
    const room = result.draft.room;
    const guard = room.monsterBindings!['hall-1'];
    const options = linesOf(guard.options).map((o) =>
      o.id === 'push-past' ? patchOption(o, { say: '(slip past him)' }) : o
    );
    const draft = structuredClone({
      ...result.draft,
      room: {
        ...room,
        monsterBindings: {
          ...room.monsterBindings,
          'hall-1': normalizeBinding({ ...guard, options })!,
        },
      },
    });
    draft.room.monsterDeclarations.find(
      (m) => m.id === 'pedlar'
    )!.startingCell!.location.q += 1;
    const saved = exportDraftYaml({ draft, scope: result.scope }, result.key);
    expect(statusesOf(saved)).toEqual(statusesOf(served));
    expect(pushPastOf(saved)).toEqual({
      ...(pushPastOf(served) as object),
      say: '(slip past him)',
    });
    expect(pushPastOf(saved)).toHaveProperty(['failure', 0, 'apply_status'], {
      status: 'held',
      to: 'party_in_sight',
    });
    // The mapping stays a mapping: exactly `status` and `to`, not a string.
    const given = (
      pushPastOf(saved) as { failure: { apply_status: unknown }[] }
    ).failure[0].apply_status;
    expect(typeof given).toBe('object');
    expect(Object.keys(given as object).sort()).toEqual(['status', 'to']);
  });
});
