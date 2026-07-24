import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', async () => {
  const THREE = await import('three');
  return { useGLTF: () => ({ scene: new THREE.Group() }) };
});

import { SyntyHexWall } from './SyntyHexWall';

function wall(kind: WallKind, id?: string): Wall {
  return {
    from: { x: 0, y: 0, z: 0 },
    to: { x: 1, y: -1, z: 0 },
    kind,
    id,
  } as Wall;
}

describe('SyntyHexWall', () => {
  it('forwards a locked door click with its server-issued Wall.id', () => {
    const onDoorClick = vi.fn();
    const { container } = render(
      <SyntyHexWall
        walls={[wall(WallKind.DOOR_LOCKED, 'locked-door-1')]}
        hexSize={1}
        onDoorClick={onDoorClick}
      />
    );

    fireEvent.click(container.querySelector('group')!);

    expect(onDoorClick).toHaveBeenCalledWith('locked-door-1');
  });

  it('does not attach the door interaction to a solid wall', () => {
    const onDoorClick = vi.fn();
    const { container } = render(
      <SyntyHexWall
        walls={[wall(WallKind.SOLID, 'not-a-door')]}
        hexSize={1}
        onDoorClick={onDoorClick}
      />
    );

    fireEvent.click(container.querySelector('primitive')!);

    expect(onDoorClick).not.toHaveBeenCalled();
  });
});
