/**
 * Tests for EncounterMap's rpg-dnd5e-web#558 real-route theme wiring:
 * `theme` (state.theme) -> HexGrid's `spaceTheme`/`ambientIntensity`/
 * `directionalIntensity`/`moodPointLights` props. HexGrid itself wraps
 * Three.js/React Three Fiber (needs a WebGL canvas, not available in
 * jsdom) — same reasoning EncounterView.test.tsx already documents for
 * mocking EncounterMap. Stub HexGrid and capture its props so this test
 * exercises EncounterMap's OWN theme-resolution/light-assembly logic
 * without rendering WebGL.
 */
import { create } from '@bufbuild/protobuf';
import type { EntityState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  HexRecordSchema,
  PositionSchema,
  WallKind,
  WallSchema,
  type HexRecord,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cubeAtColRow } from '../../hooks/wallRuns';
import type { HexGridProps } from '../hex-grid';

const hoisted = vi.hoisted(() => ({
  lastHexGridProps: { current: null as HexGridProps | null },
}));

vi.mock('../hex-grid', () => ({
  HexGrid: (props: HexGridProps) => {
    hoisted.lastHexGridProps.current = props;
    return null;
  },
}));

import { EncounterMap } from './EncounterMap';

function doorWall(id: string): Wall {
  return create(WallSchema, {
    from: create(PositionSchema, { x: 1, y: -1, z: 0 }),
    to: create(PositionSchema, { x: 2, y: -2, z: 0 }),
    kind: WallKind.DOOR_CLOSED,
    id,
  });
}

function revealedHex(x: number, y: number, z: number, zoneId = ''): HexRecord {
  return create(HexRecordSchema, {
    position: create(PositionSchema, { x, y, z }),
    zoneId,
  });
}

/** A small 2-column x 2-row zone's worth of revealed hexes, tagged with
 * `zoneId` — geometrically identical whether that zone represents a real
 * chain-generated room or a canvas dungeon's purely semantic painted
 * region (the wire can't tell the two apart from hex membership alone;
 * that's exactly the bug this file's "wall truth" describe block covers). */
function zoneHexes(zoneId: string): HexRecord[] {
  return [
    cubeAtColRow(0, 0),
    cubeAtColRow(1, 0),
    cubeAtColRow(0, 1),
    cubeAtColRow(1, 1),
  ].map((c) => revealedHex(c.x, c.y, c.z, zoneId));
}

/** A non-door SOLID wall entry — the shape a real chain dungeon's
 * perimeter/connector walls take on the wire (WallKind.SOLID = 1),
 * standing in for "the server actually emitted wall data for this
 * space" regardless of this particular entry's own position. */
function solidWall(id: string): Wall {
  return create(WallSchema, {
    from: create(PositionSchema, { x: 0, y: 0, z: 0 }),
    to: create(PositionSchema, { x: 0, y: 0, z: 0 }),
    kind: WallKind.SOLID,
    id,
  });
}

const MY_ENTITY_ID = 'char-alice';

function baseProps() {
  const entities = new Map<string, EntityState & { ghost?: boolean }>([
    [
      MY_ENTITY_ID,
      { entityId: MY_ENTITY_ID, position: { x: 0, y: 0, z: 0 } } as EntityState,
    ],
  ]);
  return {
    entities,
    entityMeta: new Map(),
    revealedHexes: new Map<string, HexRecord>([
      ['0,0,0', revealedHex(0, 0, 0)],
    ]),
    walls: new Map<string, Wall>([['door-1', doorWall('door-1')]]),
    entityHP: new Map(),
    initiativeOrder: [],
    activeEntityId: '',
    round: 0,
    myEntityId: MY_ENTITY_ID,
    isMyTurn: true,
    onMove: () => {},
    onEntityClick: () => {},
  };
}

beforeEach(() => {
  hoisted.lastHexGridProps.current = null;
});

afterEach(() => {
  // Several tests below set ?cryptAmbient=/?cryptDirectional= via
  // history.pushState (jsdom's URL, read by EncounterMap's
  // cryptLightOverride via window.location.search) — reset so it never
  // leaks into a later test in this file or another file sharing the jsdom
  // window.
  window.history.pushState({}, '', '/');
});

describe('EncounterMap theme wiring (rpg-dnd5e-web#558)', () => {
  it("theme='crypt' passes spaceTheme='crypt' and the real-route crypt ambient/directional intensities through to HexGrid (Kirk's July 24 readability bump — brighter than the ?cryptdemo=1 demo's own values, which PlaytestMap keeps separately unchanged)", () => {
    render(<EncounterMap {...baseProps()} theme="crypt" />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.spaceTheme).toBe('crypt');
    expect(props.ambientIntensity).toBe(0.4);
    expect(props.directionalIntensity).toBe(0.28);
  });

  it("theme='crypt' derives a door mood light from the real DOOR_CLOSED wall — real-route light derivation, not just the demo's fixed layout", () => {
    render(<EncounterMap {...baseProps()} theme="crypt" />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.moodPointLights).toHaveLength(1);
    expect(props.moodPointLights![0]!.color).toBe('#ff9d52'); // warm door glow
  });

  it('theme=undefined renders byte-identical to pre-#558 behavior — no spaceTheme, no ambient/directional override, no mood lights', () => {
    render(<EncounterMap {...baseProps()} />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.spaceTheme).toBeUndefined();
    expect(props.ambientIntensity).toBeUndefined();
    expect(props.directionalIntensity).toBeUndefined();
    expect(props.moodPointLights).toEqual([]);
  });

  it("an unrecognized theme string ('forest', not yet wired) falls back to the same untouched rendering as no theme at all — discriminates against a bug where EncounterMap treated ANY truthy theme string as themed instead of specifically normalizing through resolveSpaceTheme", () => {
    render(<EncounterMap {...baseProps()} theme="forest" />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.spaceTheme).toBeUndefined();
    expect(props.ambientIntensity).toBeUndefined();
    expect(props.directionalIntensity).toBeUndefined();
    expect(props.moodPointLights).toEqual([]);
  });
});

describe('EncounterMap live brightness dial (?cryptAmbient=/?cryptDirectional=, rpg-dnd5e-web#558 follow-up)', () => {
  it('overrides the baked-in ambient/directional constants when both query params are present', () => {
    window.history.pushState({}, '', '?cryptAmbient=0.6&cryptDirectional=0.5');
    render(<EncounterMap {...baseProps()} theme="crypt" />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.ambientIntensity).toBe(0.6);
    expect(props.directionalIntensity).toBe(0.5);
  });

  it('falls back to the baked-in constant for whichever param is absent, without the other override leaking across', () => {
    window.history.pushState({}, '', '?cryptAmbient=0.6');
    render(<EncounterMap {...baseProps()} theme="crypt" />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.ambientIntensity).toBe(0.6);
    expect(props.directionalIntensity).toBe(0.28); // untouched baked-in default
  });

  it('clamps an out-of-range override instead of ignoring it', () => {
    window.history.pushState({}, '', '?cryptAmbient=5&cryptDirectional=-2');
    render(<EncounterMap {...baseProps()} theme="crypt" />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.ambientIntensity).toBe(1);
    expect(props.directionalIntensity).toBe(0);
  });

  it('ignores an invalid override value and falls back to the baked-in constant', () => {
    window.history.pushState({}, '', '?cryptAmbient=notanumber');
    render(<EncounterMap {...baseProps()} theme="crypt" />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.ambientIntensity).toBe(0.4); // untouched baked-in default
  });

  it('no-ops with no query params at all — byte-identical to the baked-in default', () => {
    render(<EncounterMap {...baseProps()} theme="crypt" />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.ambientIntensity).toBe(0.4);
    expect(props.directionalIntensity).toBe(0.28);
  });

  it('has no effect at all outside the crypt theme — the override only ever applies when spaceTheme is already crypt', () => {
    window.history.pushState({}, '', '?cryptAmbient=0.9&cryptDirectional=0.9');
    render(<EncounterMap {...baseProps()} />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.ambientIntensity).toBeUndefined();
    expect(props.directionalIntensity).toBeUndefined();
  });
});

describe('EncounterMap look-lab lighting experiment dials (?floorPools=1/?litSurfaces=1, rpg-dnd5e-web#558 follow-up)', () => {
  it('no-ops with no query params at all — floorPoolLights undefined, litSurfaces false, byte-identical to pre-experiment behavior', () => {
    render(<EncounterMap {...baseProps()} theme="crypt" />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.floorPoolLights).toBeUndefined();
    expect(props.litSurfaces).toBe(false);
  });

  it('?floorPools=1 passes the SAME light list already built for moodPointLights through to floorPoolLights', () => {
    window.history.pushState({}, '', '?floorPools=1');
    render(<EncounterMap {...baseProps()} theme="crypt" />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.moodPointLights).toHaveLength(1); // the door light from baseProps()
    expect(props.floorPoolLights).toEqual(props.moodPointLights);
  });

  it('?floorPools=1 without a crypt theme still forwards whatever moodPointLights resolved to (empty, since theming is off) rather than crashing or defaulting on', () => {
    window.history.pushState({}, '', '?floorPools=1');
    render(<EncounterMap {...baseProps()} />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.moodPointLights).toEqual([]);
    expect(props.floorPoolLights).toEqual([]);
  });

  it('?litSurfaces=1 sets litSurfaces true', () => {
    window.history.pushState({}, '', '?litSurfaces=1');
    render(<EncounterMap {...baseProps()} theme="crypt" />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.litSurfaces).toBe(true);
  });

  it('an unrecognized value for either dial is treated as off, not on', () => {
    window.history.pushState({}, '', '?floorPools=true&litSurfaces=yes');
    render(<EncounterMap {...baseProps()} theme="crypt" />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.floorPoolLights).toBeUndefined();
    expect(props.litSurfaces).toBe(false);
  });
});

describe('EncounterMap wall truth gate (game walls from truth — zones are not rooms)', () => {
  it('a zone with ZERO server wall data renders NO envelope/connector walls — canvas regions are semantic-only, not rooms (the untitled-creation bug: walls: [], 3 painted regions, fictional envelope walls in the real game route)', () => {
    render(
      <EncounterMap
        {...baseProps()}
        revealedHexes={
          new Map(
            zoneHexes('region-1').map((h) => [
              `${h.position!.x},${h.position!.y},${h.position!.z}`,
              h,
            ])
          )
        }
        walls={new Map()}
      />
    );
    const props = hoisted.lastHexGridProps.current!;
    expect(props.envelopeRuns).toEqual([]);
    expect(props.envelopeCorners).toEqual([]);
    expect(props.connectorRuns).toEqual([]);
  });

  it('a zone WITH real server wall data (chain dungeons) still produces envelope walls — regression guard, this fix must not strip real room walls', () => {
    render(
      <EncounterMap
        {...baseProps()}
        revealedHexes={
          new Map(
            zoneHexes('room-a').map((h) => [
              `${h.position!.x},${h.position!.y},${h.position!.z}`,
              h,
            ])
          )
        }
        walls={new Map([['wall-1', solidWall('wall-1')]])}
      />
    );
    const props = hoisted.lastHexGridProps.current!;
    expect(props.envelopeRuns!.length).toBe(4); // left/right/top/bottom
    expect(props.envelopeCorners!.length).toBe(4);
  });

  it('an entirely empty encounter (no zones, no walls) still renders with no envelope walls, not a crash', () => {
    render(
      <EncounterMap
        {...baseProps()}
        revealedHexes={new Map()}
        walls={new Map()}
      />
    );
    const props = hoisted.lastHexGridProps.current!;
    expect(props.envelopeRuns).toEqual([]);
    expect(props.envelopeCorners).toEqual([]);
    expect(props.connectorRuns).toEqual([]);
  });
});

describe("EncounterMap authored-wall-run wiring (unit/authored-wall-runs: authored walls speak the game's run language)", () => {
  /** A non-door boundary-edge wall between two adjacent hexes that are
   * BOTH inside the same painted zone — exactly the shape #720
   * established an authored dungeon's real wall edges take relative to
   * its own (semantic-only) zone hex membership: categorizeWall's
   * 'interior' branch, the extraction point for authoredWallRuns. */
  function interiorBoundaryWall(
    fromCol: number,
    fromRow: number,
    toCol: number,
    toRow: number,
    id?: string
  ): Wall {
    const from = cubeAtColRow(fromCol, fromRow);
    const to = cubeAtColRow(toCol, toRow);
    return create(WallSchema, {
      from: create(PositionSchema, { x: from.x, y: from.y, z: from.z }),
      to: create(PositionSchema, { x: to.x, y: to.y, z: to.z }),
      kind: WallKind.SOLID,
      id,
    });
  }

  it("an authored dungeon's real boundary-edge wall renders as an authored run, not through legacySyntyWalls (the jagged-per-edge regression this unit fixes)", () => {
    const zone = zoneHexes('room-a'); // a 2x2 block: (0,0),(1,0),(0,1),(1,1)
    const edge = interiorBoundaryWall(0, 0, 1, 0, 'edge-1');
    render(
      <EncounterMap
        {...baseProps()}
        revealedHexes={
          new Map(
            zone.map((h) => [
              `${h.position!.x},${h.position!.y},${h.position!.z}`,
              h,
            ])
          )
        }
        walls={new Map([['edge-1', edge]])}
      />
    );
    const props = hoisted.lastHexGridProps.current!;
    expect(props.authoredRuns!.length).toBeGreaterThanOrEqual(1);
    expect(props.legacySyntyWalls).not.toContainEqual(edge);
  });

  it("a chain dungeon's real wall data (never in the interior category — covered by an envelope/connector run or a door instead) produces NO authored runs — regression guard for the existing chain-dungeon render path", () => {
    render(
      <EncounterMap
        {...baseProps()}
        revealedHexes={
          new Map(
            zoneHexes('room-a').map((h) => [
              `${h.position!.x},${h.position!.y},${h.position!.z}`,
              h,
            ])
          )
        }
        walls={new Map([['wall-1', solidWall('wall-1')]])}
      />
    );
    const props = hoisted.lastHexGridProps.current!;
    expect(props.authoredRuns).toEqual([]);
    // The pre-existing chain-dungeon envelope behavior (#720's own
    // regression guard, above) is untouched by this addition.
    expect(props.envelopeRuns!.length).toBe(4);
  });

  it('a degenerate interior wall (a genuine blocked-cell obstacle, e.g. a crypt pillar) stays on the legacy per-cell renderer, never becomes an authored run', () => {
    const zone = zoneHexes('room-a');
    const pillar = solidWall('pillar-1'); // degenerate: from === to at (0,0,0), inside the zone
    render(
      <EncounterMap
        {...baseProps()}
        revealedHexes={
          new Map(
            zone.map((h) => [
              `${h.position!.x},${h.position!.y},${h.position!.z}`,
              h,
            ])
          )
        }
        walls={new Map([['pillar-1', pillar]])}
      />
    );
    const props = hoisted.lastHexGridProps.current!;
    expect(props.authoredRuns).toEqual([]);
    expect(props.legacySyntyWalls).toContainEqual(pillar);
  });

  it('a door edge is unaffected: still rendered via legacySyntyWalls (the existing per-edge door frame/leaf path), never converted into an authored run', () => {
    const zone = zoneHexes('room-a');
    const door = doorWall('door-1');
    render(
      <EncounterMap
        {...baseProps()}
        revealedHexes={
          new Map(
            zone.map((h) => [
              `${h.position!.x},${h.position!.y},${h.position!.z}`,
              h,
            ])
          )
        }
        walls={new Map([['door-1', door]])}
      />
    );
    const props = hoisted.lastHexGridProps.current!;
    expect(props.legacySyntyWalls).toContainEqual(door);
  });
});
