/**
 * A STATUS THE STUDIO DOES NOT AUTHOR RIDES THROUGH AN EDIT (rpg-project#1024).
 * The served castle writes a `statuses:` section (well-fed) and a cook's line
 * whose success row gives it (`apply_status: well-fed`). The studio has no
 * form for either; an edit elsewhere, or to that very line, writes both back
 * unchanged.
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

/** The cook's help line, as written. */
function helpOf(text: string): unknown {
  const cook = parse(text).room.room.monsterBindings.cook;
  return cook.options.find((o: { id: string }) => o.id === 'help');
}

describe('the castle’s status survives the studio (rpg-project#1024)', () => {
  it('precondition: the served castle writes the status and the line that gives it', () => {
    expect(statusesOf(served)).toHaveProperty(['well-fed', 'name'], 'Well fed');
    expect(helpOf(served)).toHaveProperty(
      ['success', 0, 'apply_status'],
      'well-fed'
    );
  });

  it('moving the pedlar keeps the statuses section and the cook’s line unchanged', () => {
    const result = read(served);
    const draft = structuredClone(result.draft);
    draft.room.monsterDeclarations.find(
      (m) => m.id === 'pedlar'
    )!.startingCell!.location.q += 1;
    const saved = exportDraftYaml({ draft, scope: result.scope }, result.key);
    expect(saved).not.toBe(served);
    expect(statusesOf(saved)).toEqual(statusesOf(served));
    expect(helpOf(saved)).toEqual(helpOf(served));
  });

  it('rewording the cook’s help line keeps its apply_status', () => {
    const result = read(served);
    const room = result.draft.room;
    const cook = room.monsterBindings!['cook'];
    const options = linesOf(cook.options).map((o) =>
      o.id === 'help' ? patchOption(o, { say: '(roll out the pastry)' }) : o
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
    expect(helpOf(saved)).toEqual({
      ...(helpOf(served) as object),
      say: '(roll out the pastry)',
    });
  });
});
