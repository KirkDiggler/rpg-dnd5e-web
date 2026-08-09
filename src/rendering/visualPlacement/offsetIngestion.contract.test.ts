import { create } from '@bufbuild/protobuf';
import { PositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import { EntityStateSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  EntityType,
  HexRecordSchema,
  HexState,
  PlacementSchema,
  PositionSchema as V2PositionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import { buildRenderableEntities } from '../../components/playtest/playtestMapHelpers';
import {
  applyEntityAppearedBatch,
  applyHexRecordsMerged,
  createEmptyEncounterState,
  mergeEntityPosition,
  offsetByEntityIdFromHexes,
} from '../../hooks/useEncounterState';
import { offsetFromPlacement } from './offset';

const OMIT = Symbol('omit');
type FixtureOffset = { x: number; y: number; z: number };

function placement(
  entityId: string,
  offset: FixtureOffset | typeof OMIT = OMIT
) {
  const base = create(PlacementSchema, { entityId });
  return offset === OMIT ? base : ({ ...base, offset } as typeof base);
}

function hex(
  position: { x: number; y: number; z: number },
  state: HexState,
  contents: ReturnType<typeof placement>[]
) {
  return create(HexRecordSchema, {
    position: create(V2PositionSchema, position),
    state,
    contents,
  });
}

function seedEntity(offset?: FixtureOffset) {
  return applyEntityAppearedBatch(createEmptyEncounterState(), [
    {
      entity: create(EntityStateSchema, {
        entityId: 'entity-1',
        position: create(PositionSchema, { x: 0, y: 0, z: 0 }),
      }),
      type: EntityType.PROP,
      monsterRefId: undefined,
      initialHP: undefined,
      initialAC: undefined,
      propRefId: 'bookcase',
      offset,
    },
  ]);
}

describe('Wave B real state ingestion seams', () => {
  it('preserves omission versus explicit zero versus a nonzero triple', () => {
    expect(offsetFromPlacement(placement('a'))).toBeUndefined();
    expect(offsetFromPlacement(placement('a', { x: 0, y: 0, z: 0 }))).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
    expect(
      offsetFromPlacement(placement('a', { x: -0.1, y: 0.2, z: 0.3 }))
    ).toEqual({
      x: -0.1,
      y: 0.2,
      z: 0.3,
    });
  });

  it.each([
    ['visible-first', false],
    ['remembered-first', true],
  ] as const)(
    'gives VISIBLE offset truth precedence (%s)',
    (_name, reverse) => {
      const visible = hex({ x: 1, y: -1, z: 0 }, HexState.VISIBLE, [
        placement('entity-1', { x: 0, y: 0, z: 0 }),
      ]);
      const remembered = hex({ x: 0, y: 0, z: 0 }, HexState.REMEMBERED, [
        placement('entity-1', { x: 9, y: 8, z: 7 }),
      ]);
      const index = offsetByEntityIdFromHexes(
        reverse ? [remembered, visible] : [visible, remembered]
      );
      expect(index.get('entity-1')).toEqual({ x: 0, y: 0, z: 0 });
    }
  );

  it('lets a VISIBLE omission suppress a stale REMEMBERED explicit value', () => {
    const index = offsetByEntityIdFromHexes([
      hex({ x: 0, y: 0, z: 0 }, HexState.REMEMBERED, [
        placement('entity-1', { x: 9, y: 8, z: 7 }),
      ]),
      hex({ x: 1, y: -1, z: 0 }, HexState.VISIBLE, [placement('entity-1')]),
    ]);
    expect(index.has('entity-1')).toBe(false);
  });

  it('hydrates explicit zero from a reconnect snapshot reverse index', () => {
    const records = [
      hex({ x: 2, y: -2, z: 0 }, HexState.VISIBLE, [
        placement('entity-1', { x: 0, y: 0, z: 0 }),
      ]),
    ];
    const offset = offsetByEntityIdFromHexes(records).get('entity-1');
    const state = applyEntityAppearedBatch(createEmptyEncounterState(), [
      {
        entity: create(EntityStateSchema, {
          entityId: 'entity-1',
          position: create(PositionSchema, { x: 2, y: -2, z: 0 }),
        }),
        type: EntityType.PROP,
        monsterRefId: undefined,
        initialHP: undefined,
        initialAC: undefined,
        offset,
      },
    ]);
    expect(state.entities.get('entity-1')?.offset).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
  });

  it('updates on live resight and clears explicit offset when the VISIBLE placement omits it', () => {
    let state = seedEntity({ x: 1, y: 2, z: 3 });
    state = applyHexRecordsMerged(state, [
      hex({ x: 0, y: 0, z: 0 }, HexState.VISIBLE, [placement('entity-1')]),
    ]);
    expect(state.entities.get('entity-1')?.offset).toBeUndefined();
  });

  it('moves/re-places canonical origin while the unchanged world offset follows, then vacates without a stale entry', () => {
    let state = seedEntity({ x: 0.25, y: -0.5, z: 0.75 });
    const origin = hex({ x: 0, y: 0, z: 0 }, HexState.VISIBLE, [
      placement('entity-1', { x: 0.25, y: -0.5, z: 0.75 }),
    ]);
    state = applyHexRecordsMerged(state, [origin]);
    const destination = hex({ x: 1, y: -1, z: 0 }, HexState.VISIBLE, [
      placement('entity-1', { x: 0.25, y: -0.5, z: 0.75 }),
    ]);
    state = applyHexRecordsMerged(state, [
      hex({ x: 0, y: 0, z: 0 }, HexState.VISIBLE, []),
      destination,
    ]);
    expect(state.entities.get('entity-1')).toMatchObject({
      position: { x: 1, y: -1, z: 0 },
      offset: { x: 0.25, y: -0.5, z: 0.75 },
    });

    state = applyHexRecordsMerged(state, [
      hex({ x: 1, y: -1, z: 0 }, HexState.VISIBLE, []),
    ]);
    expect(state.entities.has('entity-1')).toBe(false);
  });

  it('keeps offset through movement events that update only canonical position/path', () => {
    const state = seedEntity({ x: 0.25, y: -0.5, z: 0.75 });
    const next = mergeEntityPosition(
      state,
      'entity-1',
      create(PositionSchema, { x: 3, y: -2, z: -1 }),
      [create(PositionSchema, { x: 3, y: -2, z: -1 })]
    );
    expect(next.entities.get('entity-1')?.offset).toEqual({
      x: 0.25,
      y: -0.5,
      z: 0.75,
    });
  });

  it('passes exact presence/value through playtestMapHelpers into the renderer shape', () => {
    const state = seedEntity({ x: 0, y: 0, z: 0 });
    const renderable = buildRenderableEntities(
      state.entities,
      state.entityMeta,
      state.entityHP
    );
    expect(renderable[0]?.offset).toEqual({ x: 0, y: 0, z: 0 });
  });
});
