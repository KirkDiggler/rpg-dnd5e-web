import { WallColors } from '@/rendering/WallBuilder';
import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ShadedHexWall } from './ShadedHexWall';

const context = { fillStyle: '', fillRect: vi.fn() };
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
  context as never
);

function wall(kind: WallKind, id = 'boss-door'): Wall {
  return {
    from: { x: 0, y: 0, z: 0 },
    to: { x: 1, y: -1, z: 0 },
    kind,
    id,
  } as Wall;
}

describe('ShadedHexWall R3F scene', () => {
  it('renders a locked door hit target that forwards its exact Wall.id', async () => {
    const onDoorClick = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <ShadedHexWall
        wall={wall(WallKind.DOOR_LOCKED, 'locked-42')}
        hexSize={1}
        onDoorClick={onDoorClick}
      />
    );
    const target = renderer.scene.find(
      (node) => typeof node.props.onClick === 'function'
    );
    await renderer.fireEvent(target, 'click');
    expect(onDoorClick).toHaveBeenCalledWith('locked-42');
    const color = new THREE.Color(WallColors.stoneDark);
    expect(context.fillStyle).toBe(
      `rgb(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)})`
    );
  });

  it('does not attach a hit target to a solid wall', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <ShadedHexWall wall={wall(WallKind.SOLID)} hexSize={1} />
    );
    expect(
      renderer.scene.findAll((node) => typeof node.props.onClick === 'function')
    ).toEqual([]);
  });
});
