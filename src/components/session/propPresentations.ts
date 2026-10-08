import type { WorldProp } from '@/concepts/world-building/types';
import { clone } from '@bufbuild/protobuf';
import {
  PropPresentationSchema,
  type AtlasStructuralDoor,
  type PropPresentation,
  type PropSighting,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/** Validate transport integrity, never visibility or collision. */
export function assertPropPresentation(p: PropPresentation): void {
  const fail = (why: string): never => {
    throw new Error(`Invalid prop presentation ${p.id || '(no id)'}: ${why}`);
  };
  if (!p.id || !p.ref || !p.origin)
    fail('identity, ref and origin are required');
  const numbers = [
    p.origin!.x,
    p.origin!.y,
    p.elevation,
    p.facingDegrees,
    p.heightScale,
  ];
  if (p.heightScale <= 0) fail('height scale must be positive');
  const light = p.pointLight;
  if (light) {
    if (
      !light.offset ||
      !/^#[0-9a-fA-F]{6}$/.test(light.color) ||
      light.intensity < 0 ||
      light.range <= 0
    )
      fail(
        'light requires offset, RGB color, nonnegative intensity and positive range'
      );
    numbers.push(
      light.offset!.x,
      light.offset!.y,
      light.offsetElevation,
      light.intensity,
      light.range
    );
  }
  if (!numbers.every(Number.isFinite)) fail('numbers must be finite');
}

export function assertPropPresentations(
  rows: readonly PropPresentation[] = [],
  structuralDoors: readonly AtlasStructuralDoor[] = []
): void {
  const ids = new Set<string>();
  const doors = new Set(structuralDoors.map((d) => d.id));
  for (const p of rows) {
    assertPropPresentation(p);
    if (ids.has(p.id) || (p.doorId && doors.has(p.doorId)))
      throw new Error(`Duplicate prop/door presentation ${p.id}`);
    ids.add(p.id);
    if (p.doorId) doors.add(p.doorId);
  }
}

export function assertPropSightings(rows: readonly PropSighting[] = []): void {
  for (const s of rows) {
    if (!s.presentation) continue;
    if (
      s.observedEmpty ||
      !s.shape.value ||
      s.shape.value.id !== s.presentation.id
    )
      throw new Error(
        'Prop sighting has conflicting presentation identity or observed-empty state'
      );
    assertPropPresentation(s.presentation);
  }
}

/** Full ID-keyed introductions/upserts, cloned only after complete validation. */
export function applyPropPresentations(
  before: readonly PropPresentation[] = [],
  additions: readonly PropPresentation[] = [],
  doors: readonly AtlasStructuralDoor[] = []
): PropPresentation[] {
  assertPropPresentations(before);
  assertPropPresentations(additions);
  const map = new Map(before.map((p) => [p.id, p]));
  for (const p of additions) map.set(p.id, p);
  const result = [...map.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  assertPropPresentations(result, doors);
  return result.map((p) => clone(PropPresentationSchema, p));
}

/** Inverse of the compiler's canonical conversion, once, at the renderer seam.
 * Origin/facing are supplied render pose: collider extents/local offsets are not
 * inputs to this function. Parent/support transforms are already baked in. */
export function propPresentationItem(
  p: PropPresentation,
  hexSize: number
): WorldProp {
  assertPropPresentation(p);
  if (!Number.isFinite(hexSize) || hexSize <= 0)
    throw new Error('Invalid prop render hex size');
  const k = (Math.sqrt(3) * hexSize) / 5;
  const light = p.pointLight;
  return {
    id: p.id,
    kind: 'prop',
    assetRef: p.ref,
    label: p.label,
    transform: {
      x: p.origin!.x * k,
      y: p.elevation * k,
      z: p.origin!.y * k,
      rotationY: (-p.facingDegrees * Math.PI) / 180,
    },
    heightScale: p.heightScale,
    pointLight: light
      ? {
          enabled: light.enabled,
          offset: {
            x: light.offset!.x * k,
            y: light.offsetElevation * k,
            z: light.offset!.y * k,
          },
          color: light.color,
          intensity: light.intensity,
          range: light.range * k,
        }
      : undefined,
  };
}
