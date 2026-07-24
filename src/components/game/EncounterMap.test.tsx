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
  PositionSchema,
  WallKind,
  WallSchema,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    revealedHexes: new Set<string>(['0,0,0']),
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

describe('EncounterMap theme wiring (rpg-dnd5e-web#558)', () => {
  it("theme='crypt' passes spaceTheme='crypt' and the real-route crypt ambient/directional intensities through to HexGrid (Kirk's July 24 readability bump — brighter than the ?cryptdemo=1 demo's own values, which PlaytestMap keeps separately unchanged)", () => {
    render(<EncounterMap {...baseProps()} theme="crypt" />);
    const props = hoisted.lastHexGridProps.current!;
    expect(props.spaceTheme).toBe('crypt');
    expect(props.ambientIntensity).toBe(0.12);
    expect(props.directionalIntensity).toBe(0.08);
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
