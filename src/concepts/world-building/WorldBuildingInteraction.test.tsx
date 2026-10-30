import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import { useThree } from '@react-three/fiber';
import ReactThreeTestRenderer, { act } from '@react-three/test-renderer';
import { createRef, useEffect, type ReactNode } from 'react';
import * as THREE from 'three';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyScene } from './sceneState';
import type { StructuralWall } from './structuralWalls';
import { MAX_WORLD_COORD } from './worldBounds';
import {
  WorldBuildingDropInteraction,
  WorldBuildingTransformGizmo,
} from './WorldBuildingInteraction';

type ControlProps = {
  children?: ReactNode;
  onMouseDown: () => void;
  onObjectChange: () => void;
  onMouseUp: () => void;
  showY: boolean;
};
const control = vi.hoisted(() => ({
  props: null as ControlProps | null,
  state: { axis: null as string | null, dragging: false },
}));
vi.mock('@react-three/drei', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return {
    TransformControls: forwardRef((props: ControlProps, ref) => {
      useImperativeHandle(ref, () => control.state);
      control.props = props;
      return props.children;
    }),
  };
});

const source: StructuralWall = {
  id: 'wall',
  label: 'Wall',
  line: { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
  appearance: {
    assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
    height: 3,
    thickness: 0.3,
    elevation: 0.2,
  },
  blocker: {
    footprint: { width: 12, depth: 0.5, offsetX: 1, offsetZ: -0.2 },
    blocksMovement: false,
    blocksLineOfSight: true,
  },
  openings: [
    {
      id: 'cut',
      position: 7,
      width: 2,
      door: {
        id: 'door',
        assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
      },
    },
  ],
};
let renderer:
  | Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
  | undefined;
beforeEach(() => {
  control.props = null;
  control.state.axis = null;
  control.state.dragging = false;
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await renderer?.unmount();
  renderer = undefined;
});

function CanvasProbe({
  capture,
}: {
  capture: (element: HTMLCanvasElement) => void;
}) {
  const element = useThree((state) => state.gl.domElement);
  useEffect(() => capture(element), [capture, element]);
  return null;
}

async function setup(mode: 'move' | 'rotate' = 'move') {
  const wall = structuredClone(source);
  const onPreview = vi.fn();
  const onCommit = vi.fn();
  const onScenePreview = vi.fn();
  const onSceneCommit = vi.fn();
  const onReject = vi.fn();
  let canvas!: HTMLCanvasElement;
  const capture = (element: HTMLCanvasElement) => {
    canvas = element;
  };
  const props = {
    controlsRef: createRef<TransformControlsImpl>(),
    scene: createEmptyScene('scene'),
    selectedIds: [] as string[],
    tool: mode,
    onPreview: onScenePreview,
    onCommit: onSceneCommit,
    onReject,
    onTransformingChange: vi.fn(),
    wallTarget: { wall, horizontalLimit: 40, onPreview, onCommit },
  };
  const view = (tool: 'select' | 'move' | 'rotate' = mode) => (
    <>
      <CanvasProbe capture={capture} />
      <WorldBuildingTransformGizmo {...props} tool={tool} />
    </>
  );
  renderer = await ReactThreeTestRenderer.create(view());
  const proxy = renderer.scene.findByProps({
    name: 'world-building-selection-pivot',
  }).instance as THREE.Group;
  return {
    wall,
    props,
    view,
    canvas,
    proxy,
    onPreview,
    onCommit,
    onScenePreview,
    onSceneCommit,
    onReject,
  };
}

/*
 * The canvas is unbounded (rpg-project#725): the studio passes no workspace to
 * these interactions and the document no longer refuses content outside one
 * (workspaceContentBounds.ts is deleted). The tests below drive the props the
 * viewport passes now. Retired with the workspace: the rectangular-cell
 * refusal of a wall release, the cancel-on-workspace-change of an active
 * transform, the drop mask outside a rectangle and the document's
 * footprint-overhang refusal.
 */
describe('unbounded interaction', () => {
  it('commits a far wall release within the world bound and keeps its doors unchanged', async () => {
    const h = await setup();
    await renderer!.update(
      <WorldBuildingTransformGizmo
        {...h.props}
        wallTarget={{ ...h.props.wallTarget, horizontalLimit: MAX_WORLD_COORD }}
      />
    );
    const proxy = renderer!.scene.findByProps({
      name: 'world-building-selection-pivot',
    }).instance as THREE.Group;
    await act(async () => {
      control.props!.onMouseDown();
      proxy.position.z += 400;
      control.props!.onObjectChange();
      control.props!.onMouseUp();
    });
    expect(h.onReject).not.toHaveBeenCalled();
    const committed = h.onCommit.mock.lastCall![0] as StructuralWall;
    expect(h.onCommit).toHaveBeenCalledOnce();
    expect(committed.line).toEqual({
      start: { x: 0, z: 400 },
      end: { x: 10, z: 400 },
    });
    expect(committed.openings).toEqual(source.openings);
    expect(h.wall.openings).toEqual(source.openings);
  });

  it('previews and commits a scene anchor move once, leaving the source scene untouched', async () => {
    const h = await setup();
    const scene = {
      ...createEmptyScene('prop'),
      version: 2 as const,
      items: [
        {
          id: 'books',
          kind: 'prop' as const,
          assetRef: 'dnd5e:props:books',
          label: 'Books',
          transform: { x: 0, y: 0, z: 0, rotationY: 0 },
        },
      ],
    };
    await renderer!.update(
      <WorldBuildingTransformGizmo
        {...h.props}
        wallTarget={undefined}
        scene={scene}
        sceneHorizontalLimit={MAX_WORLD_COORD}
        selectedIds={['books']}
      />
    );
    const proxy = renderer!.scene.findByProps({
      name: 'world-building-selection-pivot',
    }).instance as THREE.Group;
    await act(async () => {
      control.props!.onMouseDown();
      proxy.position.x += 50.5;
      control.props!.onObjectChange();
    });
    expect(h.onScenePreview.mock.lastCall![0].items[0].transform.x).toBe(50.5);
    await act(async () => control.props!.onMouseUp());
    expect(h.onSceneCommit).toHaveBeenCalledOnce();
    expect(h.onSceneCommit.mock.lastCall![0].items[0].transform.x).toBe(50.5);
    expect(h.onReject).not.toHaveBeenCalled();
    expect(scene.items[0]!.transform.x).toBe(0);
  });

  it('previews and drops at ground and surface anchors anywhere, and ignores abandoned transfers', async () => {
    const payload = { kind: 'prop' as const, id: 'dnd5e:props:books' };
    let canvas!: HTMLCanvasElement;
    const capture = (element: HTMLCanvasElement) => {
      canvas = element;
    };
    const onDrop = vi.fn(),
      onDragFinished = vi.fn();
    const view = (activeDrag: typeof payload | null) => (
      <>
        <CanvasProbe capture={capture} />
        <WorldBuildingDropInteraction
          activeDrag={activeDrag}
          floorY={0}
          onDrop={onDrop}
          onDragFinished={onDragFinished}
        />
      </>
    );
    renderer = await ReactThreeTestRenderer.create(view(payload));
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
    } as DOMRect);
    const ground = new THREE.Mesh();
    ground.userData.worldBuildingGround = true;
    let p = cubeToWorld({ x: 36, y: -36, z: 0 }, HEX_SIZE);
    const intersections = vi
      .spyOn(THREE.Raycaster.prototype, 'intersectObjects')
      .mockImplementation(() => [
        {
          object: ground,
          point: new THREE.Vector3(p.x, 0, p.z),
          distance: 1,
          face: {
            a: 0,
            b: 1,
            c: 2,
            normal: new THREE.Vector3(0, 1, 0),
            materialIndex: 0,
          },
        },
      ]);
    const event = (name: string): Event => {
      const e = new Event(name, { cancelable: true });
      Object.defineProperties(e, {
        clientX: { value: 400 },
        clientY: { value: 300 },
        dataTransfer: { value: { getData: () => JSON.stringify(payload) } },
      });
      return e;
    };
    await act(async () => canvas.dispatchEvent(event('dragover')));
    expect(
      renderer.scene.findAllByProps({ name: 'world-building-drop-preview' })
    ).toHaveLength(1);
    await act(async () => canvas.dispatchEvent(event('drop')));
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(payload, {
      kind: 'ground',
      point: p,
    });
    // Past where a 73 × 48 workspace used to end: the canvas is unbounded.
    p = cubeToWorld({ x: 37, y: -37, z: 0 }, HEX_SIZE);
    await act(async () => canvas.dispatchEvent(event('drop')));
    expect(onDrop).toHaveBeenCalledTimes(2);
    expect(onDrop).toHaveBeenLastCalledWith(payload, {
      kind: 'ground',
      point: p,
    });
    ground.userData.worldBuildingSupportId = 'support';
    await act(async () => {
      canvas.dispatchEvent(event('dragover'));
      canvas.dispatchEvent(event('drop'));
    });
    // With no workspace mask, an upward support face anchors a surface drop
    // wherever it is (its overhang was refused only past the workspace).
    expect(onDrop).toHaveBeenCalledTimes(3);
    expect(onDrop).toHaveBeenLastCalledWith(payload, {
      kind: 'surface',
      point: { x: p.x, y: 0, z: p.z },
      supportId: 'support',
    });
    ground.userData.worldBuildingSupportId = undefined;
    p = { x: 0, z: 0 };
    await act(async () => canvas.dispatchEvent(event('dragover')));
    expect(
      renderer.scene.findAllByProps({ name: 'world-building-drop-preview' })
    ).toHaveLength(1);
    await renderer.update(view(null));
    expect(
      renderer.scene.findAllByProps({ name: 'world-building-drop-preview' })
    ).toHaveLength(0);
    await act(async () => canvas.dispatchEvent(event('drop')));
    expect(onDrop).toHaveBeenCalledTimes(3);
    intersections.mockRestore();
  });
});

describe('shared transform gizmo wall target', () => {
  it('previews against the committed wall and commits once without editing scene props', async () => {
    const h = await setup();
    expect(control.props!.showY).toBe(false);
    expect(h.proxy.position.toArray()).toEqual([5, 0.2, 0]);
    await act(async () => {
      control.props!.onMouseDown();
      h.proxy.position.x += 2;
      h.proxy.position.z += 3;
      control.props!.onObjectChange();
    });
    expect(h.wall).toEqual(source);
    expect(h.onCommit).not.toHaveBeenCalled();
    const preview = h.onPreview.mock.lastCall![0] as StructuralWall;
    expect(preview.line).toEqual({
      start: { x: 2, z: 3 },
      end: { x: 12, z: 3 },
    });
    expect(preview.blocker).toEqual(source.blocker);
    expect(preview.openings).toEqual(source.openings);
    await act(async () => {
      control.props!.onMouseUp();
      control.props!.onMouseUp();
    });
    expect(h.onCommit).toHaveBeenCalledExactlyOnceWith(preview);
    expect(h.onPreview).toHaveBeenLastCalledWith(null);
    expect(h.onSceneCommit).not.toHaveBeenCalled();
    expect(h.onScenePreview.mock.calls.every(([value]) => value === null)).toBe(
      true
    );
  });

  it.each([90, 135, 180, -90])(
    'keeps world-Y yaw direction through %s degrees',
    async (degrees) => {
      const h = await setup('rotate');
      expect(control.props!.showY).toBe(true);
      const angle = (degrees * Math.PI) / 180;
      await act(async () => {
        control.props!.onMouseDown();
        h.proxy.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        control.props!.onObjectChange();
        control.props!.onMouseUp();
      });
      const result = h.onCommit.mock.lastCall![0] as StructuralWall;
      expect(result.line.end.x).toBeCloseTo(5 + 5 * Math.cos(angle));
      expect(result.line.end.z).toBeCloseTo(-5 * Math.sin(angle));
      expect(result.openings).toEqual(source.openings);
      expect(result.blocker).toEqual(source.blocker);
    }
  );

  it.each([
    'escape',
    'contextmenu',
    'pointercancel',
    'lostpointercapture',
    'tool change',
    'unmount',
  ])('cancels on %s without a commit', async (reason) => {
    const h = await setup();
    await act(async () => {
      control.props!.onMouseDown();
      h.proxy.position.x += 2;
      control.props!.onObjectChange();
    });
    await act(async () => {
      if (reason === 'escape')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else if (reason === 'tool change')
        await renderer!.update(h.view('select'));
      else if (reason === 'unmount') {
        await renderer!.unmount();
        renderer = undefined;
      } else h.canvas.dispatchEvent(new Event(reason));
    });
    expect(h.onPreview).toHaveBeenLastCalledWith(null);
    expect(h.onCommit).not.toHaveBeenCalled();
    expect(h.wall).toEqual(source);
  });

  it('rejects a release past the wall limit and restores the drag-start proxy', async () => {
    const h = await setup();
    await act(async () => {
      control.props!.onMouseDown();
      h.proxy.position.x += 100;
      control.props!.onObjectChange();
      control.props!.onMouseUp();
    });
    expect(h.onCommit).not.toHaveBeenCalled();
    expect(h.onReject).toHaveBeenCalledWith(
      expect.stringContaining('Transform rejected')
    );
    expect(h.proxy.position.toArray()).toEqual([5, 0.2, 0]);
    expect(h.wall).toEqual(source);
  });

  it('retains the existing prop target and a full 135-degree world-Y turn', async () => {
    const h = await setup();
    const scene = createEmptyScene('props');
    scene.items = [
      {
        id: 'books',
        kind: 'prop',
        assetRef: 'dnd5e:props:books',
        label: 'Books',
        transform: { x: 2, y: 0.3, z: 3, rotationY: 0 },
      },
    ];
    await renderer!.update(
      <WorldBuildingTransformGizmo
        {...h.props}
        wallTarget={undefined}
        scene={scene}
        selectedIds={['books']}
        tool="rotate"
      />
    );
    const proxy = renderer!.scene.findByProps({
      name: 'world-building-selection-pivot',
    }).instance as THREE.Group;
    const angle = (3 * Math.PI) / 4;
    await act(async () => {
      control.props!.onMouseDown();
      proxy.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      control.props!.onObjectChange();
      control.props!.onMouseUp();
    });
    expect(h.onSceneCommit).toHaveBeenCalledOnce();
    expect(
      h.onSceneCommit.mock.lastCall![0].items[0].transform.rotationY
    ).toBeCloseTo(angle);
    expect(h.onCommit).not.toHaveBeenCalled();
    expect(scene.items[0].transform.rotationY).toBe(0);
  });

  it('does not commit a click without a transform', async () => {
    const h = await setup();
    await act(async () => {
      control.props!.onMouseDown();
      control.props!.onMouseUp();
    });
    expect(h.onCommit).not.toHaveBeenCalled();
  });
});
