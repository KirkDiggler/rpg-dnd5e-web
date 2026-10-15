// @vitest-environment jsdom
/**
 * StructuralLayoutEnvironment — the runtime body that draws the session's
 * supplied structural records through the REAL shared World Building leaves.
 *
 * The shared asset leaves are stubbed (no WebGL/GLB in CI), exactly as
 * `DungeonEnvironment.test.tsx` does, so the assertions read the mounted
 * graph: the wall pieces, the independent door, the unknown-state marker and
 * the click affordance. Conversion itself is proven against the numeric
 * witness in `structuralLayout.test.ts`.
 */
import { create } from '@bufbuild/protobuf';
import {
  AtlasStructuralDoorSchema,
  AtlasStructuralWallSchema,
  DoorInfoSchema,
  DoorState,
  FootprintPointSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { structuralLayoutRender } from './structuralLayout';
import { StructuralLayoutEnvironment } from './StructuralLayoutEnvironment';

vi.mock('@/components/hex-grid/PropModel', () => ({
  PropModel: (props: Record<string, unknown>) => (
    <group name="stub-legacy-prop" userData={props} />
  ),
}));
vi.mock('@/components/hex-grid/WorldAssetModel', () => ({
  WorldAssetModel: (props: Record<string, unknown>) => (
    <group name="stub-world-asset" userData={props} />
  ),
}));

const K = 5 / Math.sqrt(3);
const WALL = 'dnd5e:env:dark-fortress:45_wall_01';
const DOOR = 'dnd5e:env:dark-fortress:wall_door_double_01';
const feet = (x: number, y: number) => create(FootprintPointSchema, { x, y });

function render(walls: unknown[] = [], doors: unknown[] = []) {
  return structuralLayoutRender(walls as never, doors as never, 1);
}

function wall(overrides: Record<string, unknown> = {}) {
  return create(AtlasStructuralWallSchema, {
    id: 'wall-1',
    ref: WALL,
    from: feet(0, 0),
    to: feet(10 * K, 0),
    height: 3 * K,
    thickness: 0.3 * K,
    elevation: 0.2 * K,
    openings: [{ id: 'cut-1', position: 7 * K, width: 2 * K }],
    ...overrides,
  });
}

function door(overrides: Record<string, unknown> = {}) {
  return create(AtlasStructuralDoorSchema, {
    id: 'front-room/gate',
    ref: DOOR,
    from: feet(6 * K, 0),
    to: feet(8 * K, 0),
    height: 3 * K,
    thickness: 0.3 * K,
    elevation: 0.2 * K,
    ...overrides,
  });
}

const observation = (state: DoorState) =>
  create(DoorInfoSchema, { door: 'front-room/gate', state });

describe('StructuralLayoutEnvironment', () => {
  it('draws the supplied wall through the shared repeated-surface leaf', async () => {
    const built = render([wall()]);
    const view = await ReactThreeTestRenderer.create(
      <StructuralLayoutEnvironment
        walls={built.walls}
        doors={built.doors}
        diagnostics={built.diagnostics}
      />
    );
    const pieces = view.scene.findByProps({
      name: 'structural-wall-pieces-wall-1',
    });
    expect(pieces).toBeTruthy();
    // Real repeated asset pieces, not a fabricated proxy.
    expect(
      view.scene.findAllByProps({ name: 'stub-world-asset' }).length
    ).toBeGreaterThan(0);
    await view.unmount();
  });

  it('renders an independently permitted door with NO parent wall record', async () => {
    const built = render([], [door()]);
    expect(built.walls).toEqual([]);
    const view = await ReactThreeTestRenderer.create(
      <StructuralLayoutEnvironment
        walls={built.walls}
        doors={built.doors}
        diagnostics={built.diagnostics}
        observedDoors={
          new Map([['front-room/gate', observation(DoorState.CLOSED)]])
        }
      />
    );
    const doorGroup = view.scene.findByProps({
      name: 'structural-wall-door-front-room/gate',
    });
    expect(doorGroup).toBeTruthy();
    // Position is the endpoint midline (7), independent of any wall.
    expect(doorGroup.props.position[0]).toBeCloseTo(7, 5);
    // The canonical gameplay id joins the observed state; no prefix guessing.
    expect(doorGroup.props.userData.state).toBe('closed');
    await view.unmount();
  });

  it('offers the existing callback with the canonical id for a supplied KNOWN closed state', async () => {
    const onDoorClick = vi.fn();
    const built = render([], [door()]);
    const view = await ReactThreeTestRenderer.create(
      <StructuralLayoutEnvironment
        walls={built.walls}
        doors={built.doors}
        diagnostics={built.diagnostics}
        observedDoors={
          new Map([['front-room/gate', observation(DoorState.CLOSED)]])
        }
        onDoorClick={onDoorClick}
      />
    );
    const leaf = view.scene.findByProps({ name: 'stub-world-asset' });
    const onClick = (leaf.props.userData as { onDoorClick?: () => void })
      .onDoorClick;
    expect(onClick).toBeTypeOf('function');
    onClick!();
    expect(onDoorClick).toHaveBeenCalledWith('front-room/gate');
    await view.unmount();
  });

  it('offers the callback for a supplied LOCKED state (the existing unlock verb)', async () => {
    const onDoorClick = vi.fn();
    const built = render([], [door()]);
    const view = await ReactThreeTestRenderer.create(
      <StructuralLayoutEnvironment
        walls={built.walls}
        doors={built.doors}
        diagnostics={built.diagnostics}
        observedDoors={
          new Map([['front-room/gate', observation(DoorState.LOCKED)]])
        }
        onDoorClick={onDoorClick}
      />
    );
    const leaf = view.scene.findByProps({ name: 'stub-world-asset' });
    expect(
      (leaf.props.userData as { onDoorClick?: () => void }).onDoorClick
    ).toBeTypeOf('function');
    await view.unmount();
  });

  it('forwards a click on an observed OPEN door for the close intent', async () => {
    const onDoorClick = vi.fn();
    const built = render([], [door()]);
    const view = await ReactThreeTestRenderer.create(
      <StructuralLayoutEnvironment
        walls={built.walls}
        doors={built.doors}
        diagnostics={built.diagnostics}
        observedDoors={
          new Map([['front-room/gate', observation(DoorState.OPEN)]])
        }
        onDoorClick={onDoorClick}
      />
    );
    const leaf = view.scene.findByProps({ name: 'stub-world-asset' });
    const click = (leaf.props.userData as { onDoorClick?: () => void })
      .onDoorClick;
    expect(click).toBeTypeOf('function');
    click?.();
    expect(onDoorClick).toHaveBeenCalledWith('front-room/gate');
    await view.unmount();
  });

  it('greys only the wall pieces inside a remembered stretch', async () => {
    const built = render([wall()]);
    const view = await ReactThreeTestRenderer.create(
      <StructuralLayoutEnvironment
        walls={built.walls}
        doors={built.doors}
        diagnostics={built.diagnostics}
        rememberedWallSpans={new Map([['wall-1', [{ from: 0.5, to: 1 }]]])}
      />
    );
    const pieces = view.scene.findAll(
      (node) =>
        typeof node.props.name === 'string' &&
        node.props.name.startsWith('structural-wall-piece-wall-1-')
    );
    const states = pieces.map((piece) => piece.props.userData.knowledge);
    expect(states).toContain('seen');
    expect(states).toContain('remembered');
    // Pieces are laid out in order along the line: lit first, grey after.
    expect(states.indexOf('remembered')).toBeGreaterThan(
      states.lastIndexOf('seen')
    );
    await view.unmount();
  });

  it('draws a door with NO observation closed, remembered and inert — never an unobserved marker (R2)', async () => {
    const onDoorClick = vi.fn();
    const built = render([], [door()]);
    const view = await ReactThreeTestRenderer.create(
      <StructuralLayoutEnvironment
        walls={built.walls}
        doors={built.doors}
        diagnostics={built.diagnostics}
        // No observation supplied at all.
        onDoorClick={onDoorClick}
      />
    );
    expect(
      view.scene.findAllByProps({
        name: 'structural-door-unknown-front-room/gate',
      })
    ).toHaveLength(0);
    const assembly = view.scene.findByProps({
      name: 'structural-wall-door-front-room/gate',
    });
    expect(assembly.props.userData).toMatchObject({
      state: 'closed',
      open: false,
      knowledge: 'remembered',
    });
    const assets = view.scene.findAllByProps({ name: 'stub-world-asset' });
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) {
      expect(asset.props.userData.remembered).toBe(true);
      expect(asset.props.userData.onDoorClick).toBeUndefined();
    }
    expect(onDoorClick).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('draws a wall and a door no seen cell borders in the remembered treatment', async () => {
    const built = render([], [door()]);
    const view = await ReactThreeTestRenderer.create(
      <StructuralLayoutEnvironment
        walls={built.walls}
        doors={built.doors}
        diagnostics={built.diagnostics}
        observedDoors={
          new Map([['front-room/gate', observation(DoorState.CLOSED)]])
        }
        onDoorClick={vi.fn()}
        rememberedDoorIds={new Set(['front-room/gate'])}
      />
    );
    const assembly = view.scene.findByProps({
      name: 'structural-wall-door-front-room/gate',
    });
    expect(assembly.props.userData.knowledge).toBe('remembered');
    for (const asset of view.scene.findAllByProps({
      name: 'stub-world-asset',
    })) {
      expect(asset.props.userData.remembered).toBe(true);
      expect(asset.props.userData.onDoorClick).toBeUndefined();
    }
    await view.unmount();
  });

  it('does not draw an unknown marker for a known state', async () => {
    const built = render([], [door()]);
    const view = await ReactThreeTestRenderer.create(
      <StructuralLayoutEnvironment
        walls={built.walls}
        doors={built.doors}
        diagnostics={built.diagnostics}
        observedDoors={
          new Map([['front-room/gate', observation(DoorState.CLOSED)]])
        }
      />
    );
    expect(
      view.scene.findAllByProps({
        name: 'structural-door-unknown-front-room/gate',
      })
    ).toHaveLength(0);
    await view.unmount();
  });

  it('names malformed supplied records without dropping a mesh at the origin', async () => {
    const built = structuralLayoutRender(
      [create(AtlasStructuralWallSchema, { id: 'broken', ref: WALL })],
      [],
      1
    );
    expect(built.diagnostics.length).toBe(1);
    const view = await ReactThreeTestRenderer.create(
      <StructuralLayoutEnvironment
        walls={built.walls}
        doors={built.doors}
        diagnostics={built.diagnostics}
      />
    );
    const diagnostics = view.scene.findByProps({
      name: 'structural-layout-diagnostics',
    });
    expect(
      (diagnostics.props.userData as { reasons: string[] }).reasons[0]
    ).toMatch(/wall broken/);
    expect(
      view.scene.findAllByProps({ name: 'stub-world-asset' })
    ).toHaveLength(0);
    await view.unmount();
  });

  it('draws nothing for legacy/empty supplied collections', async () => {
    const built = render();
    const view = await ReactThreeTestRenderer.create(
      <StructuralLayoutEnvironment
        walls={built.walls}
        doors={built.doors}
        diagnostics={built.diagnostics}
      />
    );
    expect(
      view.scene.findAllByProps({ name: 'stub-world-asset' })
    ).toHaveLength(0);
    expect(
      view.scene.findAllByProps({ name: 'structural-layout-diagnostics' })
    ).toHaveLength(0);
    await view.unmount();
  });
});
