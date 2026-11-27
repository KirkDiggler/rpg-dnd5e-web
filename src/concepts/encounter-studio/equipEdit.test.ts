import { describe, expect, it } from 'vitest';
import { withBinding } from '../world-building/monsterOrderEdits';
import type { RoomMonsterBinding } from '../world-building/roomDraft';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import { equipmentOf, withEquipment } from './equipEdit';
import ringYaml from './fixtures/cloak-and-ring-walk.yaml?raw';

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

describe('equipmentOf (rpg-project#1203)', () => {
  it('lists a person’s equipment in the file’s order', () => {
    expect(equipmentOf(read(ringYaml), 'guard')).toEqual({
      kind: 'list',
      ids: ['lieutenants-cloak', 'garrison-ring'],
    });
  });

  it('is none for a creature with no binding and for a binding with no key', () => {
    const document = read(ringYaml);
    expect(equipmentOf(document, 'nobody')).toEqual({ kind: 'none' });
    const bindings = document.draft.room.monsterBindings!;
    bindings.guard = { faction: 'garrison' };
    expect(equipmentOf(document, 'guard')).toEqual({ kind: 'none' });
  });

  it.each([['cloak'], [[1, 'x']], [{ a: 1 }]])(
    'is other for %j, which is not a list of strings',
    (written) => {
      const document = read(ringYaml);
      (document.draft.room.monsterBindings!.guard as Record<string, unknown>) =
        { equipment: written };
      expect(equipmentOf(document, 'guard')).toEqual({
        kind: 'other',
        written,
      });
    }
  );
});

describe('withEquipment (rpg-project#1203)', () => {
  const binding = {
    faction: 'garrison',
    mood: 'wary',
    equipment: ['a'],
  } as RoomMonsterBinding;

  it('sets a copy of the list and keeps every other key', () => {
    const ids = ['x', 'y'];
    const next = withEquipment(binding, ids) as Record<string, unknown>;
    expect(next).toEqual({ faction: 'garrison', mood: 'wary', equipment: ids });
    expect(next.equipment).not.toBe(ids);
  });

  it('removes the key for an empty list and leaves the rest', () => {
    const next = withEquipment(binding, []) as Record<string, unknown>;
    expect(next).toEqual({ faction: 'garrison', mood: 'wary' });
    expect('equipment' in next).toBe(false);
  });

  it('makes a binding of its own for a creature with none', () => {
    expect(withEquipment(undefined, ['a'])).toEqual({ equipment: ['a'] });
  });
});

describe('equipment through the file (rpg-project#1203)', () => {
  it('one equipment line changes and every other line stays', () => {
    const document = read(ringYaml);
    const room = document.draft.room;
    const bindings = withBinding(
      room.monsterBindings,
      'guard',
      withEquipment(room.monsterBindings?.guard, ['garrison-ring'])
    );
    const draft = {
      ...document.draft,
      room: { ...room, monsterBindings: bindings },
    };
    const before = exportDraftYaml(document, 'k');
    const after = exportDraftYaml({ draft, scope: document.scope }, 'k');
    const reread = read(after);
    expect(equipmentOf(reread, 'guard')).toEqual({
      kind: 'list',
      ids: ['garrison-ring'],
    });
    const left = before.split('\n');
    const right = after.split('\n');
    expect(right.length).toBe(left.length);
    const changed = right.filter((line, at) => line !== left[at]);
    expect(changed).toEqual(['        equipment: [garrison-ring]']);
    expect(reread.scope).toEqual(document.scope);
    expect(reread.draft.room.monsterDeclarations).toEqual(
      room.monsterDeclarations
    );
  });
});
