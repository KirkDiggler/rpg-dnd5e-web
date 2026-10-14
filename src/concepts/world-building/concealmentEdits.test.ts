import { describe, expect, it } from 'vitest';
import { createPopulatedStudioDocument } from '../encounter-studio/fixtures/studioDocument';
import {
  addConcealment,
  concealmentHiding,
  concealmentMemberKind,
  paintConcealmentCells,
  renameConcealment,
  setConcealment,
  setConcealmentProp,
  setPropHiddenBy,
  toggleConcealmentMember,
} from './concealmentEdits';
import {
  lifetimeNotice,
  parseRoomDocumentJson,
  stringifyRoomDraft,
  stripLegacyLifetime,
  type RoomDraftDocument,
} from './roomDraft';
import { validateSiteConcealments, type SiteScope } from './siteScope';

const scope: SiteScope = {
  concealments: {
    vault: { checks: [{ ability: 'investigation', dc: 15 }], props: ['door'] },
  },
  intel: [{ id: 'map', reveals: { concealment: 'vault' } }],
};

describe('concealment document edits', () => {
  it('adds a clicked prop only once and removes membership without rewriting other fields', () => {
    const picked = setConcealmentProp(scope, 'vault', 'chest', true);
    expect(picked.concealments?.vault?.props).toEqual(['door', 'chest']);
    expect(setConcealmentProp(picked, 'vault', 'chest', true)).toBe(picked);
    expect(setConcealmentProp(picked, 'vault', 'chest', false)).toEqual(scope);
    expect(setConcealmentProp(scope, 'missing', 'chest', true)).toBe(scope);
  });
  it('adds unique declarations and omits the map when the last is removed', () => {
    const one = addConcealment({});
    const two = addConcealment(one);
    expect(Object.keys(two.concealments!)).toEqual(['secret-1', 'secret-2']);
    expect(setConcealment(one, 'secret-1', undefined)).toEqual({});
  });
  it('renames only the declaration and never overwrites another', () => {
    const renamed = renameConcealment(scope, 'vault', 'cellar');
    expect(renamed.concealments?.vault).toBeUndefined();
    expect(renamed.concealments?.cellar).toEqual(scope.concealments?.vault);
    expect(renamed.intel).toEqual(scope.intel);
    const two = addConcealment(scope);
    expect(renameConcealment(two, 'vault', 'secret-1')).toBe(two);
    expect(scope.concealments?.vault).toBeDefined();
  });
  it('paints and erases membership without mutating the input or other fields', () => {
    const cells = [
      { q: 1, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ];
    const painted = paintConcealmentCells(scope, 'vault', cells, 'paint');
    expect(painted.concealments?.vault?.cells).toEqual([cells[0], cells[2]]);
    expect(painted.concealments?.vault?.props).toEqual(['door']);
    expect(scope.concealments?.vault?.cells).toBeUndefined();
    const erased = paintConcealmentCells(painted, 'vault', cells, 'erase');
    expect(erased).toEqual(scope);
    expect(paintConcealmentCells(scope, 'missing', cells, 'paint')).toBe(scope);
  });
});

describe('concealment members on the map (rpg-project#578, S4-Q5)', () => {
  function document(): RoomDraftDocument {
    const populated = createPopulatedStudioDocument();
    populated.scope.concealments = {
      ...populated.scope.concealments,
      stash: { checks: [{ ability: 'investigation', dc: 14 }] },
    };
    return populated;
  }
  const walkable = (doc: RoomDraftDocument) =>
    doc.draft.room.walkableHexes.find(
      (cell) => !(cell.q === 1 && cell.r === 0)
    )!;

  it('a walkable cell toggles in and out', () => {
    const doc = document();
    const cell = walkable(doc);
    const added = toggleConcealmentMember(doc, 'stash', { kind: 'cell', cell });
    expect(added.concealments!.stash.cells).toEqual([cell]);
    const removed = toggleConcealmentMember({ ...doc, scope: added }, 'stash', {
      kind: 'cell',
      cell,
    });
    expect(removed.concealments!.stash.cells).toBeUndefined();
  });

  it('a wall can be a member and an undeclared prop cannot', () => {
    const doc = document();
    const wall = toggleConcealmentMember(doc, 'stash', {
      kind: 'prop',
      id: 'studio-wall',
    });
    expect(wall.concealments!.stash.props).toEqual(['studio-wall']);
    expect(concealmentMemberKind(doc, 'studio-wall')).toBe('wall');
    expect(concealmentMemberKind(doc, 'studio-door')).toBe('door');
    const undeclared = doc.draft.scene.items.find(
      (item) => !Object.hasOwn(doc.draft.room.propDeclarations, item.id)
    )!;
    expect(() =>
      toggleConcealmentMember(doc, 'stash', { kind: 'prop', id: undeclared.id })
    ).toThrow(
      `${undeclared.label} has no declaration, so it cannot be hidden. Only declared props, doors and walls can.`
    );
  });

  it('an unwalkable cell is refused', () => {
    const doc = document();
    doc.draft.room.walkableHexes = [{ q: 0, r: 0 }];
    expect(() =>
      toggleConcealmentMember(doc, 'stash', {
        kind: 'cell',
        cell: { q: 5, r: 5 },
      })
    ).toThrow('Hex q 5, r 5 is not walkable floor, so it cannot be hidden.');
  });

  it('a member already in another concealment is refused', () => {
    const doc = document();
    doc.draft.room.walkableHexes = [
      ...doc.draft.room.walkableHexes,
      { q: 1, r: 0 },
    ];
    expect(() =>
      toggleConcealmentMember(doc, 'stash', {
        kind: 'prop',
        id: 'studio-door',
      })
    ).toThrow(
      'the door in Studio north wall is already hidden by studio-secret.'
    );
    expect(() =>
      toggleConcealmentMember(doc, 'stash', {
        kind: 'cell',
        cell: { q: 1, r: 0 },
      })
    ).toThrow('Hex q 1, r 0 is already hidden by studio-secret.');
  });

  it('Hidden by moves only the door id, and names the concealment that lists it', () => {
    const doc = document();
    expect(concealmentHiding(doc.scope, 'studio-door')).toBe('studio-secret');
    const moved = setPropHiddenBy(doc.scope, 'studio-door', 'stash');
    expect(concealmentHiding(moved, 'studio-door')).toBe('stash');
    expect(moved.concealments!['studio-secret'].props).toBeUndefined();
    expect(moved.concealments!['studio-secret'].cells).toEqual([
      { q: 1, r: 0 },
    ]);
    expect(() => setPropHiddenBy(doc.scope, 'studio-door', 'nope')).toThrow(
      'There is no concealment nope.'
    );
  });
});

describe('attempts.lifetime (rpg-project#578, S4-Q1)', () => {
  it("validateSiteConcealments refuses lifetime with the toolkit's sentence", () => {
    expect(() =>
      validateSiteConcealments({
        vault: {
          checks: [{ ability: 'investigation', dc: 14 }],
          attempts: { max: 2, lifetime: 'run' },
        },
      })
    ).toThrow(
      'Site concealment vault attempts.lifetime: "lifetime" is not a key this build reads: they are max, reset_hexes'
    );
    expect(
      validateSiteConcealments({
        vault: {
          checks: [{ ability: 'investigation', dc: 14 }],
          attempts: { max: 2, reset_hexes: 3 },
        },
      }).vault.attempts
    ).toEqual({ max: 2, reset_hexes: 3 });
  });

  it('the stored-draft read strips lifetime and names the concealments it left', () => {
    const doc = createPopulatedStudioDocument();
    const envelope = JSON.parse(stringifyRoomDraft(doc.draft, doc.scope));
    envelope.scope.concealments['studio-secret'].attempts = {
      max: 2,
      lifetime: 'character',
    };
    const stripped = stripLegacyLifetime(JSON.stringify(envelope));
    expect(stripped.strippedFrom).toEqual(['studio-secret']);
    expect(
      parseRoomDocumentJson(stripped.json).scope.concealments!['studio-secret']
        .attempts
    ).toEqual({ max: 2 });
    expect(lifetimeNotice(stripped.strippedFrom)).toBe(
      'lifetime is not read by the engine; removed from studio-secret, attempts keep max and reset_hexes'
    );
    const clean = stringifyRoomDraft(doc.draft, doc.scope);
    expect(stripLegacyLifetime(clean)).toEqual({
      json: clean,
      strippedFrom: [],
    });
    expect(stripLegacyLifetime('not json')).toEqual({
      json: 'not json',
      strippedFrom: [],
    });
  });
});
