import { create } from '@bufbuild/protobuf';
import {
  GetAtlasResponseSchema,
  type GetAtlasResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  MemberKind,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  exitAt,
  holdTargets,
  lootTargets,
  propLabel,
} from './holdingAffordances';
import { positionToCube } from './positionBridge';
import type { SightedMember } from './sightingEntities';

const at = (x: number, y: number) => positionToCube({ x, y } as never);

function sighted(
  subject: string,
  cell: [number, number],
  standing: Standing,
  remembered = false
): SightedMember {
  return {
    subject,
    name: subject,
    kind: MemberKind.MONSTER,
    monsterRefId: subject,
    position: at(cell[0], cell[1]),
    remembered,
    standing,
  };
}

describe('lootTargets — every downed body in reach, and only reach is computed', () => {
  const viewer = at(0, 0);

  it('offers every downed body beside the viewer', () => {
    const targets = lootTargets(
      [
        sighted('captain', [1, 0], Standing.DOWNED),
        sighted('skeleton-1', [0, 1], Standing.DOWNED),
      ],
      viewer
    );
    expect(targets.map((t) => t.subject)).toEqual(['captain', 'skeleton-1']);
  });

  it('SAYS NOTHING about which body is worth looting (design P3)', () => {
    // Two identical offers for two bodies that hold very different things.
    // There is no field here that could differ, and that is the point: an
    // affordance that singled one out would leak the whole secret.
    const [a, b] = lootTargets(
      [
        sighted('captain', [1, 0], Standing.DOWNED),
        sighted('skeleton-1', [0, 1], Standing.DOWNED),
      ],
      viewer
    );
    expect(Object.keys(a)).toEqual(Object.keys(b));
    expect(Object.keys(a).sort()).toEqual(['name', 'subject']);
  });

  it('leaves out a body that is standing', () => {
    expect(
      lootTargets([sighted('captain', [1, 0], Standing.UP)], viewer)
    ).toEqual([]);
    expect(
      lootTargets([sighted('captain', [1, 0], Standing.UNSPECIFIED)], viewer)
    ).toEqual([]);
  });

  it('leaves out a body more than one cell away', () => {
    expect(
      lootTargets([sighted('captain', [2, 0], Standing.DOWNED)], viewer)
    ).toEqual([]);
  });

  it('includes a body the viewer only remembers', () => {
    // Excluding it would make the offer a statement about line of sight,
    // which is a rule. A stale memory is refused at the seam.
    expect(
      lootTargets([sighted('captain', [1, 0], Standing.DOWNED, true)], viewer)
        .length
    ).toBe(1);
  });

  it('offers nothing before the viewer’s own position is known', () => {
    expect(
      lootTargets([sighted('captain', [1, 0], Standing.DOWNED)], null)
    ).toEqual([]);
  });
});

function atlas(props: GetAtlasResponse['props']): GetAtlasResponse {
  return create(GetAtlasResponseSchema, { props });
}

describe('holdTargets — where the wire says holdable, never guessed', () => {
  const viewer = at(0, 0);

  it('offers a holdable prop beside the viewer', () => {
    const targets = holdTargets(
      atlas([
        {
          id: 'heirloom',
          ref: 'dnd5e:props:reliquary',
          at: { x: 1, y: 0 },
          holdable: true,
        },
      ] as never),
      viewer
    );
    expect(targets).toEqual([{ id: 'heirloom', ref: 'dnd5e:props:reliquary' }]);
  });

  it('NEVER guesses the verb from an id', () => {
    // `AtlasProp.holdable`'s own law: ids exist for anything a scenario
    // binds to, so an altar bound as a scenario's landmark would sprout a
    // Hold button if this inferred one from the name. Two facts, asked
    // separately.
    expect(
      holdTargets(
        atlas([
          {
            id: 'north-altar',
            ref: 'dnd5e:props:altar',
            at: { x: 1, y: 0 },
            holdable: false,
          },
        ] as never),
        viewer
      )
    ).toEqual([]);
  });

  it('false is the default and it is the truth — a prop nobody declared is scenery', () => {
    expect(
      holdTargets(
        atlas([{ ref: 'dnd5e:props:pillar', at: { x: 1, y: 0 } }] as never),
        viewer
      )
    ).toEqual([]);
  });

  it('skips a holdable prop with no id — there is no name to send', () => {
    // The compiler refuses a holdable prop without an id, so this is a
    // producer defect; an empty target would be a request that cannot
    // succeed.
    expect(
      holdTargets(
        atlas([
          { ref: 'dnd5e:props:reliquary', at: { x: 1, y: 0 }, holdable: true },
        ] as never),
        viewer
      )
    ).toEqual([]);
  });

  it('offers a prop the member is STANDING ON (Kirk’s second walk)', () => {
    // He was standing on the obelisk at (11,6) — a `blocks_movement:
    // false` prop can be stood on, and the thing under your feet is the
    // most obviously reachable thing there is. Distance 0, not 1.
    expect(
      holdTargets(
        atlas([
          {
            id: 'obelisk',
            ref: 'dnd5e:props:obelisk',
            at: { x: 0, y: 0 },
            holdable: true,
          },
        ] as never),
        viewer
      )
    ).toEqual([{ id: 'obelisk', ref: 'dnd5e:props:obelisk' }]);
  });

  it('leaves out a prop more than one cell away, and one with no cell', () => {
    expect(
      holdTargets(
        atlas([
          { id: 'far', ref: 'r', at: { x: 3, y: 0 }, holdable: true },
          { id: 'nowhere', ref: 'r', holdable: true },
        ] as never),
        viewer
      )
    ).toEqual([]);
  });

  it('offers nothing without an atlas or a position', () => {
    expect(holdTargets(null, viewer)).toEqual([]);
    expect(holdTargets(atlas([] as never), null)).toEqual([]);
  });
});

describe('exitAt — which way out the member is standing on', () => {
  const withExits = (exits: unknown[]) =>
    create(GetAtlasResponseSchema, { exits } as never);

  it('names the exit under the member’s feet', () => {
    const withEntrance = withExits([{ id: 'entrance', at: { x: 1, y: 3 } }]);
    expect(exitAt(withEntrance, at(1, 3))?.id).toBe('entrance');
  });

  it('is undefined one cell away — an exit is used from ITS cell', () => {
    const withEntrance = withExits([{ id: 'entrance', at: { x: 1, y: 3 } }]);
    expect(exitAt(withEntrance, at(1, 4))).toBeUndefined();
  });

  it('is undefined for a dungeon whose author declared no way out', () => {
    // Every dungeon authored before slice 2. The client draws no marker and
    // behaves exactly as it did before; nothing is defaulted in.
    expect(exitAt(withExits([]), at(1, 3))).toBeUndefined();
    expect(exitAt(null, at(1, 3))).toBeUndefined();
  });

  it('survives an atlas whose fields are ABSENT, not merely empty', () => {
    // A server or a client-side schema older than these fields hands back
    // a message with them missing entirely, and a bare `.find`/`for…of`
    // throws on `undefined` — `atlasToScene3D` documents the same hazard
    // for facing/offset. Both answer "nothing here", which is what an
    // atlas that says nothing actually means.
    const older = { props: undefined, exits: undefined } as never;
    expect(() => exitAt(older, at(1, 3))).not.toThrow();
    expect(exitAt(older, at(1, 3))).toBeUndefined();
    expect(holdTargets(older, at(0, 0))).toEqual([]);
  });
});

describe('propLabel', () => {
  it('reads the ref’s last segment as words', () => {
    expect(propLabel({ id: 'heirloom', ref: 'dnd5e:props:reliquary' })).toBe(
      'reliquary'
    );
    expect(propLabel({ id: 'x', ref: 'dnd5e:props:statue-reaper' })).toBe(
      'statue reaper'
    );
  });

  it('falls back to the id when the ref says nothing', () => {
    expect(propLabel({ id: 'vault-key', ref: '' })).toBe('vault key');
  });
});
