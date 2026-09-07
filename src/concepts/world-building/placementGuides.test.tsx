import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
} from '@/components/hex-grid/hexMath';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  compositionGuideBounds,
  placementAnchorHex,
  type MeasuredWorldPropBounds,
} from './placementGuides';
import type { WorldScene } from './types';
import {
  WorldPlacementGuideControl,
  WorldPlacementGuides,
} from './WorldPlacementGuides';

const SCENE: WorldScene = {
  version: 1,
  id: 'scene',
  name: 'Offset assembly',
  groups: [],
  items: [
    {
      id: 'table',
      kind: 'prop',
      assetRef: 'dnd5e:props:torture-table',
      label: 'table',
      transform: { x: 2, y: 1, z: 3, rotationY: Math.PI / 2 },
    },
  ],
};

const TABLE_BOUNDS: MeasuredWorldPropBounds = {
  assetRef: 'dnd5e:props:torture-table',
  bounds: {
    minY: 0.25,
    maxY: 2.25,
    width: 4,
    height: 2,
    depth: 2,
  },
};

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('World Building placement guides', () => {
  it('uses the real shared pointy-hex basis for the X0/Z0 placement anchor', () => {
    const expectedCenter = cubeToWorld({ x: 0, y: 0, z: 0 }, HEX_SIZE);
    const anchor = placementAnchorHex();

    expect(anchor.center).toEqual(expectedCenter);
    expect(anchor.corners).toEqual(hexCorners(expectedCenter, HEX_SIZE));
  });

  it('merges measured visible prop bounds with authored yaw, height, and shared surface alignment', () => {
    const guide = compositionGuideBounds(
      SCENE,
      new Map([['table', TABLE_BOUNDS]])
    );

    expect(guide).not.toBeNull();
    expect(guide!.center).toEqual([2, DUNGEON_SURFACE_Y + 2.25, 3]);
    expect(guide!.size[0]).toBeCloseTo(2);
    expect(guide!.size[1]).toBeCloseTo(2);
    expect(guide!.size[2]).toBeCloseTo(4);
  });

  it('updates from display transforms and drops loading, removed, or stale measurements without inventing bounds', () => {
    const measured = new Map([['table', TABLE_BOUNDS]]);
    const moved: WorldScene = {
      ...SCENE,
      items: [
        {
          ...SCENE.items[0]!,
          transform: { ...SCENE.items[0]!.transform, x: -4, z: 7 },
        },
      ],
    };

    expect(compositionGuideBounds(moved, measured)?.center).toEqual([
      -4,
      DUNGEON_SURFACE_Y + 2.25,
      7,
    ]);

    const withFarProp: WorldScene = {
      ...SCENE,
      items: [
        SCENE.items[0]!,
        {
          ...SCENE.items[0]!,
          id: 'far-table',
          transform: { ...SCENE.items[0]!.transform, x: 10 },
        },
      ],
    };
    const bothMeasured = new Map(measured).set('far-table', TABLE_BOUNDS);
    expect(compositionGuideBounds(withFarProp, bothMeasured)?.size[0]).toBe(10);
    expect(compositionGuideBounds(SCENE, bothMeasured)?.size[0]).toBeCloseTo(2);

    expect(
      compositionGuideBounds(
        {
          ...SCENE,
          items: [
            SCENE.items[0]!,
            {
              ...SCENE.items[0]!,
              id: 'still-loading',
              assetRef: 'dnd5e:props:barrel',
            },
          ],
        },
        measured
      )
    ).toBeNull();
    expect(
      compositionGuideBounds(
        {
          ...SCENE,
          items: [{ ...SCENE.items[0]!, assetRef: 'dnd5e:props:barrel' }],
        },
        measured
      )
    ).toBeNull();
    expect(
      compositionGuideBounds({ ...SCENE, items: [] }, measured)
    ).toBeNull();
  });

  it('toggles only the composition bounds mesh while retaining the anchor and authored scene JSON', async () => {
    const before = JSON.stringify(SCENE);
    const bounds = compositionGuideBounds(
      SCENE,
      new Map([['table', TABLE_BOUNDS]])
    );
    const renderer = await ReactThreeTestRenderer.create(
      <WorldPlacementGuides bounds={bounds} showCompositionBounds />
    );

    function ControlHarness() {
      const [showCompositionBounds, setShowCompositionBounds] = useState(true);
      return (
        <WorldPlacementGuideControl
          showCompositionBounds={showCompositionBounds}
          onShowCompositionBoundsChange={setShowCompositionBounds}
        />
      );
    }

    render(<ControlHarness />);
    const checkbox = screen.getByRole('checkbox', {
      name: 'Show composition bounds',
    });
    const expectAnchorRetained = () => {
      expect(
        renderer.scene.findByProps({
          name: 'world-building-placement-anchor-fill',
        })
      ).toBeTruthy();
      expect(
        renderer.scene.findByProps({
          name: 'world-building-placement-anchor-outline',
        })
      ).toBeTruthy();
    };

    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(
      renderer.scene.findByProps({
        name: 'world-building-composition-bounds',
      })
    ).toBeTruthy();
    expectAnchorRetained();

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    await renderer.update(
      <WorldPlacementGuides bounds={bounds} showCompositionBounds={false} />
    );
    expect(
      renderer.scene.findAllByProps({
        name: 'world-building-composition-bounds',
      })
    ).toHaveLength(0);
    expectAnchorRetained();

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    await renderer.update(
      <WorldPlacementGuides bounds={bounds} showCompositionBounds />
    );
    expect(
      renderer.scene.findByProps({
        name: 'world-building-composition-bounds',
      })
    ).toBeTruthy();
    expectAnchorRetained();
    expect(JSON.stringify(SCENE)).toBe(before);

    for (const name of [
      'world-building-placement-anchor-fill',
      'world-building-placement-anchor-outline',
      'world-building-composition-bounds',
    ]) {
      const overlay = renderer.scene.findByProps({ name });
      expect(overlay.props.raycast).toBeTypeOf('function');
      expect(overlay.props.onPointerDown).toBeUndefined();
    }
  });
});
