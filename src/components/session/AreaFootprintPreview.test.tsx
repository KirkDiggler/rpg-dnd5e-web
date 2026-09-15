import type { Footprint } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  FootprintOrigin,
  FootprintShape,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  AreaFootprintPreview,
  NON_INTERACTIVE_FOOTPRINT_RAYCAST,
} from './AreaFootprintPreview';

const box: Footprint = {
  $typeName: 'dnd5e.api.session.v1alpha1.Footprint',
  shape: FootprintShape.BOX,
  sizeFeet: 15,
  origin: FootprintOrigin.CASTER_EDGE,
};

describe('AreaFootprintPreview', () => {
  it('renders a lightly shaded floor outline only when projection is supported', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <AreaFootprintPreview
        footprint={box}
        caster={{ x: 0, y: 0, z: 0 }}
        aimed={{ x: 1, y: -1, z: 0 }}
        hexSize={1}
      />
    );

    const fill = renderer.scene.findByProps({
      name: 'area-footprint-preview-fill',
    });
    const border = renderer.scene.findByProps({
      name: 'area-footprint-preview-border',
    });
    const grid = renderer.scene.findByProps({
      name: 'area-footprint-preview-grid',
    });
    const material = (fill.instance as THREE.Mesh)
      .material as THREE.MeshBasicMaterial;
    const gridMaterial = (grid.instance as THREE.LineSegments)
      .material as THREE.LineBasicMaterial;

    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeLessThan(0.25);
    expect(border).toBeDefined();
    expect(gridMaterial.transparent).toBe(true);
    expect(gridMaterial.opacity).toBeGreaterThan(material.opacity);
    expect(gridMaterial.opacity).toBeLessThan(0.6);

    await renderer.update(
      <AreaFootprintPreview
        footprint={box}
        caster={{ x: 0, y: 0, z: 0 }}
        aimed={{ x: 0, y: 0, z: 0 }}
        hexSize={1}
      />
    );
    expect(
      renderer.scene.findAllByProps({ name: 'area-footprint-preview-fill' })
    ).toHaveLength(0);
    expect(
      renderer.scene.findAllByProps({ name: 'area-footprint-preview-grid' })
    ).toHaveLength(0);
  });

  it('clips the existing world hex lattice to a rotated aimed box without moving the grid off-lattice', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <AreaFootprintPreview
        footprint={box}
        caster={{ x: 0, y: 0, z: 0 }}
        aimed={{ x: 0, y: -1, z: 1 }}
        hexSize={1}
      />
    );
    const grid = renderer.scene.findByProps({
      name: 'area-footprint-preview-grid',
    }).instance as THREE.LineSegments;
    const positions = grid.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const center = { x: Math.sqrt(3), z: 3 };
    const rotation = -Math.PI / 3;
    const halfExtent = (3 * Math.sqrt(3)) / 2;

    expect(positions.count).toBeGreaterThan(0);
    for (let index = 0; index < positions.count; index += 1) {
      const dx = positions.getX(index) - center.x;
      const dz = positions.getZ(index) - center.z;
      const localX = Math.cos(rotation) * dx - Math.sin(rotation) * dz;
      const localZ = Math.sin(rotation) * dx + Math.cos(rotation) * dz;
      expect(Math.abs(localX)).toBeLessThanOrEqual(halfExtent + 1e-6);
      expect(Math.abs(localZ)).toBeLessThanOrEqual(halfExtent + 1e-6);
    }
    // A corner of the ordinary world hex at cube (1,-1,0) survives clipping.
    // The footprint rotates around it; the lattice itself does not translate.
    expect(
      Array.from({ length: positions.count }, (_, index) => index).some(
        (index) =>
          Math.abs(positions.getX(index) - (3 * Math.sqrt(3)) / 2) < 1e-6 &&
          Math.abs(positions.getZ(index) + 0.5) < 1e-6
      )
    ).toBe(true);
  });

  it('clips the same world grid inside a supported caster radius', async () => {
    const radius: Footprint = {
      $typeName: 'dnd5e.api.session.v1alpha1.Footprint',
      shape: FootprintShape.RADIUS,
      sizeFeet: 10,
      origin: FootprintOrigin.CASTER,
    };
    const renderer = await ReactThreeTestRenderer.create(
      <AreaFootprintPreview
        footprint={radius}
        caster={{ x: 0, y: 0, z: 0 }}
        aimed={null}
        hexSize={1}
      />
    );
    const grid = renderer.scene.findByProps({
      name: 'area-footprint-preview-grid',
    }).instance as THREE.LineSegments;
    const positions = grid.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const worldRadius = 2 * Math.sqrt(3);

    expect(positions.count).toBeGreaterThan(0);
    for (let index = 0; index < positions.count; index += 1) {
      expect(
        Math.hypot(positions.getX(index), positions.getZ(index))
      ).toBeLessThanOrEqual(worldRadius + 1e-6);
    }
  });

  it('cannot enter pointer intersections or consume ground interaction', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <AreaFootprintPreview
        footprint={box}
        caster={{ x: 0, y: 0, z: 0 }}
        aimed={{ x: 1, y: -1, z: 0 }}
        hexSize={1}
      />
    );
    const nodes = [
      renderer.scene.findByProps({ name: 'area-footprint-preview-fill' }),
      renderer.scene.findByProps({ name: 'area-footprint-preview-border' }),
      renderer.scene.findByProps({ name: 'area-footprint-preview-grid' }),
    ];

    for (const node of nodes) {
      expect(node.props.raycast).toBe(NON_INTERACTIVE_FOOTPRINT_RAYCAST);
      expect(node.props.onClick).toBeUndefined();
      expect(node.props.onPointerMove).toBeUndefined();
      const hits: THREE.Intersection[] = [];
      NON_INTERACTIVE_FOOTPRINT_RAYCAST(
        new THREE.Raycaster(),
        hits as THREE.Intersection<THREE.Object3D>[]
      );
      expect(hits).toEqual([]);
    }
  });
});
