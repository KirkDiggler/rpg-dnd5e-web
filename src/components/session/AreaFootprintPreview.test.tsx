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
    const material = (fill.instance as THREE.Mesh)
      .material as THREE.MeshBasicMaterial;

    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeLessThan(0.25);
    expect(border).toBeDefined();

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
