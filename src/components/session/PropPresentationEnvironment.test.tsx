import type { WorldPropModelProps } from '@/concepts/world-building/WorldPropModel';
import { create } from '@bufbuild/protobuf';
import {
  DoorInfoSchema,
  DoorState,
  PropPresentationSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PropPresentationEnvironment } from './PropPresentationEnvironment';
const models = vi.hoisted(() => ({ calls: [] as WorldPropModelProps[] }));
vi.mock('@/concepts/world-building/WorldPropModel', () => ({
  WorldPropModel: (props: WorldPropModelProps) => {
    models.calls.push(props);
    return <group name="shared-prop-model" />;
  },
}));

beforeEach(() => {
  models.calls = [];
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
const prop = () =>
  create(PropPresentationSchema, {
    id: 'books',
    ref: 'dnd5e:props:books',
    origin: { x: 5, y: 0 },
    elevation: 2,
    facingDegrees: 45,
    heightScale: 1.5,
  });
describe('permitted shared prop renderer', () => {
  it('renders supplied appearance through the existing model leaf with memory treatment', async () => {
    const r = await ReactThreeTestRenderer.create(
      <PropPresentationEnvironment
        presentations={[prop()]}
        hexSize={1}
        rememberedIds={new Set(['books'])}
      />
    );
    expect(models.calls.at(-1)?.entry.ref).toBe('dnd5e:props:books');
    expect(models.calls.at(-1)?.position[0]).toBeCloseTo(Math.sqrt(3));
    expect(models.calls.at(-1)?.position[1]).toBeCloseTo(
      (2 * Math.sqrt(3)) / 5
    );
    expect(models.calls.at(-1)?.rotationY).toBeCloseTo(-Math.PI / 4);
    expect(models.calls.at(-1)?.heightScale).toBe(1.5);
    expect(models.calls.at(-1)?.remembered).toBe(true);
    await r.unmount();
  });
  it('does not turn missing door state into a closed interactive model', async () => {
    const p = prop();
    p.doorId = 'actual/gate';
    const click = vi.fn();
    const r = await ReactThreeTestRenderer.create(
      <PropPresentationEnvironment
        presentations={[p]}
        hexSize={1}
        onDoorClick={click}
      />
    );
    expect(models.calls).toHaveLength(0);
    expect(
      r.scene.findByProps({ name: 'prop-door-unknown-actual/gate' })
    ).toBeTruthy();
    const doors = new Map([
      [
        'actual/gate',
        create(DoorInfoSchema, { door: 'actual/gate', state: DoorState.OPEN }),
      ],
    ]);
    await r.update(
      <PropPresentationEnvironment
        presentations={[p]}
        hexSize={1}
        doors={doors}
        onDoorClick={click}
      />
    );
    expect(models.calls.at(-1)?.open).toBe(true);
    expect(models.calls.at(-1)?.onDoorClick).toBeUndefined();
    await r.update(
      <PropPresentationEnvironment
        presentations={[p]}
        hexSize={1}
        doors={doors}
        currentDoorIds={new Set(['actual/gate'])}
        onDoorClick={click}
      />
    );
    models.calls.at(-1)?.onDoorClick?.();
    expect(click).toHaveBeenCalledWith('actual/gate');
    await r.unmount();
  });
  it('shows a named failure for an unknown asset rather than losing it silently', async () => {
    const p = prop();
    p.ref = 'unknown:content:missing';
    const r = await ReactThreeTestRenderer.create(
      <PropPresentationEnvironment presentations={[p]} hexSize={1} />
    );
    expect(models.calls).toHaveLength(0);
    expect(
      r.scene.findByProps({ name: 'room-scene-item-error-books' })
    ).toBeTruthy();
    await r.unmount();
  });
});
