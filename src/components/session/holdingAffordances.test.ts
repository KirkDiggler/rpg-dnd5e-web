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
import { holdTargets, lootTargets, propLabel } from './holdingAffordances';
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

describe('holdTargets — every NAMED prop in reach', () => {
  const viewer = at(0, 0);

  it('offers a prop the author named, beside the viewer', () => {
    const targets = holdTargets(
      atlas([
        {
          id: 'heirloom',
          ref: 'dnd5e:props:reliquary',
          at: { x: 1, y: 0 },
        },
      ] as never),
      viewer
    );
    expect(targets).toEqual([{ id: 'heirloom', ref: 'dnd5e:props:reliquary' }]);
  });

  it('never offers a prop the author left unnamed', () => {
    // There is no id to send, so there is no offer to make — the request
    // names its target by `place[].id` and nothing else.
    expect(
      holdTargets(
        atlas([{ ref: 'dnd5e:props:pillar', at: { x: 1, y: 0 } }] as never),
        viewer
      )
    ).toEqual([]);
  });

  it('offers a NAMED pillar too — holdable is not on the wire', () => {
    // `AtlasProp` carries no holdable flag; whether a thing can be picked
    // up is the rule half's answer, refused by name. Filtering here would
    // be this client inventing a rule it cannot know.
    expect(
      holdTargets(
        atlas([
          { id: 'north-pillar', ref: 'dnd5e:props:pillar', at: { x: 1, y: 0 } },
        ] as never),
        viewer
      )
    ).toHaveLength(1);
  });

  it('leaves out a prop more than one cell away, and one with no cell', () => {
    expect(
      holdTargets(
        atlas([
          { id: 'far', ref: 'r', at: { x: 3, y: 0 } },
          { id: 'nowhere', ref: 'r' },
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
