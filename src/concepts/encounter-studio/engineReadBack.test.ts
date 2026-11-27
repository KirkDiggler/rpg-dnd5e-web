/**
 * WHERE A READ-BACK CONNECTION LANDS (rpg-project#968, R25): each kind is
 * turned into the compiler's own path for that id and resolved by the one
 * path map, `targetOfPath`, on the served castle.
 */
import { describe, expect, it } from 'vitest';
import { readDraftYaml } from './draftFile';
import { connectionJump, statementPathJump } from './engineReadBack';
import itemsSite from './fixtures/cloak-and-ring-walk.yaml?raw';
import hailSite from './fixtures/hail-site.yaml?raw';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { locate } from './locatePath';
import { targetOfPath } from './refusalJump';

const castle = (() => {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
})();

/** The wall and opening that hold the door with this id, read from the
 * document itself. */
function openingOf(doorId: string): { wallId: string; openingId: string } {
  for (const wall of castle.draft.room.walls ?? [])
    for (const opening of wall.openings)
      if (opening.door?.id === doorId)
        return { wallId: wall.id, openingId: opening.id };
  throw new Error(`no opening holds ${doorId}`);
}

describe('connectionJump on the served castle', () => {
  it('a door connection selects the door with that id, on its own opening', () => {
    expect(
      connectionJump({ kind: 'door', id: 'gate-wall-door' }, castle)
    ).toEqual({
      kind: 'target',
      target: {
        kind: 'door',
        target: {
          kind: 'door',
          doorId: 'gate-wall-door',
          ...openingOf('gate-wall-door'),
        },
      },
    });
    // A different door lands on a different opening.
    expect(openingOf('cells-wall-door')).not.toEqual(
      openingOf('gate-wall-door')
    );
  });

  it('a statement set on a wall opening’s door lands on that same door', () => {
    const walls = castle.draft.room.walls ?? [];
    const wallIndex = walls.findIndex((wall) =>
      wall.openings.some((opening) => opening.door?.id === 'gate-wall-door')
    );
    const openingIndex = walls[wallIndex]!.openings.findIndex(
      (opening) => opening.door?.id === 'gate-wall-door'
    );
    const fromPath = statementPathJump(
      {
        path: `room.room.walls[${wallIndex}].openings[${openingIndex}].door`,
      },
      { kind: 'creature', id: 'captain' },
      castle
    );
    const fromConnection = connectionJump(
      { kind: 'door', id: 'gate-wall-door' },
      castle
    );
    expect(fromConnection?.kind).toBe('target');
    expect(fromPath).toEqual(
      fromConnection?.kind === 'target' ? fromConnection.target : null
    );
  });

  it('a faction opens Factions on that faction', () => {
    expect(connectionJump({ kind: 'faction', id: 'garrison' }, castle)).toEqual(
      {
        kind: 'target',
        target: { kind: 'home', section: 'factions', id: 'garrison' },
      }
    );
  });

  it('a record, a concealment, a fact and a topic open their hub’s thread (rpg-project#973)', () => {
    for (const [kind, id] of [
      ['record', 'cooks-ledger'],
      ['concealment', 'kitchen-passage'],
      ['fact', 'guards-turned'],
      ['topic', 'admitted'],
    ] as const)
      expect(connectionJump({ kind, id }, castle)).toEqual({
        kind: 'hub',
        hub: kind,
        id,
      });
  });

  it('a way pointer is a jump to its way, never a way itself', () => {
    expect(
      connectionJump({ kind: 'way', id: 'way:passage:x:told:y' }, castle)
    ).toEqual({ kind: 'way', id: 'way:passage:x:told:y' });
  });

  it('a bundle opens Bundles on that bundle', () => {
    expect(connectionJump({ kind: 'bundle', id: 'revenger' }, castle)).toEqual({
      kind: 'target',
      target: { kind: 'home', section: 'bundles', id: 'revenger' },
    });
  });

  it('an exit selects its hex', () => {
    const exit = castle.scope.exits!.find(
      (entry) => entry.id === 'front-door'
    )!;
    expect(connectionJump({ kind: 'exit', id: 'front-door' }, castle)).toEqual({
      kind: 'target',
      target: { kind: 'hex', cell: { ...exit.cell } },
    });
  });

  it('a conversation opens Interactions on it', () => {
    expect(
      connectionJump({ kind: 'conversation', id: 'front-gate' }, castle)
    ).toEqual({
      kind: 'target',
      target: { kind: 'home', section: 'interactions', id: 'front-gate' },
    });
  });

  it('an id the document does not hold lands nowhere; a routine opens Behaviours on it (rpg-project#970)', () => {
    for (const kind of ['faction', 'bundle', 'exit', 'door'])
      expect(connectionJump({ kind, id: 'no-such-id' }, castle)).toBeNull();
    expect(
      connectionJump({ kind: 'routine', id: 'captain-policy' }, castle)
    ).toEqual({ kind: 'hub', hub: 'routine', id: 'captain-policy' });
  });
});

describe('connectionJump on an item', () => {
  it('an item connection jumps to the item', () => {
    const result = readDraftYaml(itemsSite);
    if (!result.ok) throw new Error(result.refusal);
    const document = { draft: result.draft, scope: result.scope };
    expect(
      connectionJump({ kind: 'item', id: 'lieutenants-cloak' }, document)
    ).toEqual({
      kind: 'target',
      target: { kind: 'home', section: 'items', id: 'lieutenants-cloak' },
    });
  });
});

describe('a path under customItems', () => {
  it('lands on the Items page at the item', () => {
    const result = readDraftYaml(itemsSite);
    if (!result.ok) throw new Error(result.refusal);
    const document = { draft: result.draft, scope: result.scope };
    expect(targetOfPath('customItems.garrison-ring', document)).toEqual({
      kind: 'home',
      section: 'items',
      id: 'garrison-ring',
    });
    expect(targetOfPath('customItems.no-such-item', document)).toBeNull();
  });
});

describe('a path under statuses', () => {
  const document = () => {
    const result = readDraftYaml(hailSite);
    if (!result.ok) throw new Error(result.refusal);
    return { draft: result.draft, scope: result.scope };
  };

  it('locates to the status', () => {
    expect(locate('statuses.welcomed.changes[0]', document())).toMatchObject({
      kind: 'status',
      id: 'welcomed',
      rest: ['changes', 0],
    });
    expect(locate('statuses.no-such-status', document())).toBeNull();
  });

  it('a refusal there lands on the Status effects page at the status', () => {
    expect(targetOfPath('statuses.welcomed.changes[0]', document())).toEqual({
      kind: 'home',
      section: 'statuses',
      id: 'welcomed',
    });
  });

  it('a status connection jumps to the status', () => {
    expect(
      connectionJump({ kind: 'status', id: 'welcomed' }, document())
    ).toEqual({
      kind: 'target',
      target: { kind: 'home', section: 'statuses', id: 'welcomed' },
    });
  });
});
