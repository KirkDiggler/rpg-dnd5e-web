import { create } from '@bufbuild/protobuf';
import {
  ConcealmentRevealedSchema,
  RegionRevealedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { GetAtlasResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  PropPresentationSchema,
  PropSightingSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { applyConcealmentRevealed, applyRegionRevealed } from './applyReveal';
import { buildScene3D } from './atlasToScene3D';
import {
  applyPropPresentations,
  assertPropPresentation,
  assertPropSightings,
  propPresentationItem,
} from './propPresentations';

const row = () =>
  create(PropPresentationSchema, {
    id: 'p',
    ref: 'dnd5e:props:books',
    origin: { x: 15, y: -10 },
    elevation: 2.5,
    facingDegrees: 90,
    heightScale: 1.2,
    pointLight: {
      enabled: true,
      offset: { x: 1, y: 2 },
      offsetElevation: 3,
      color: '#aabbcc',
      intensity: 2,
      range: 5,
    },
  });
describe('permitted prop renderer input', () => {
  it('converts the supplied pose once without a collider or parent transform', () => {
    const p = row();
    const item = propPresentationItem(p, 1);
    expect(item.transform.x).toBeCloseTo(3 * Math.sqrt(3));
    expect(item.transform.z).toBeCloseTo(-2 * Math.sqrt(3));
    expect(item.transform.y).toBeCloseTo(0.5 * Math.sqrt(3));
    expect(item.transform.rotationY).toBeCloseTo(-Math.PI / 2);
    expect(item.heightScale).toBe(1.2);
    expect(item.pointLight!.range).toBeCloseTo(Math.sqrt(3));
    expect(item.parentId).toBeUndefined();
  });
  it('keeps v2 props and replaces only matching legacy visuals', () => {
    const atlas = create(GetAtlasResponseSchema, {
      props: [
        { id: 'p', ref: 'dnd5e:props:books', at: { x: 0, y: 0 } },
        { id: 'pillar', ref: 'dnd5e:props:pillar', at: { x: 1, y: 0 } },
      ],
    });
    expect(buildScene3D(atlas, 1, 'pointy').props).toHaveLength(2);
    atlas.propPresentations = [row()];
    const scene = buildScene3D(atlas, 1, 'pointy');
    expect(scene.props.map((p) => p.id)).toEqual(['pillar']);
    expect(scene.propPresentations).toHaveLength(1);
  });
  it('applies both reveal paths atomically and owns records', () => {
    const atlas = create(GetAtlasResponseSchema);
    const p = row();
    const room = applyRegionRevealed(
      atlas,
      create(RegionRevealedSchema, {
        region: { id: 'r' },
        propPresentations: [p],
      })
    );
    const secret = applyConcealmentRevealed(
      atlas,
      create(ConcealmentRevealedSchema, { propPresentations: [p] })
    );
    expect(room.propPresentations).toEqual(secret.propPresentations);
    expect(atlas.propPresentations).toEqual([]);
    p.pointLight!.range = 999;
    expect(room.propPresentations[0].pointLight!.range).toBe(5);
    const bad = row();
    bad.heightScale = 0;
    expect(() =>
      applyConcealmentRevealed(
        room,
        create(ConcealmentRevealedSchema, { propPresentations: [bad] })
      )
    ).toThrow(/height scale/);
    expect(room.propPresentations[0].heightScale).toBe(1.2);
    const replacement = row();
    replacement.elevation = 3;
    expect(
      applyPropPresentations(room.propPresentations, [replacement])
    ).toHaveLength(1);
  });
  it('refuses missing/invalid pose, light, duplicated identity and dual door channels', () => {
    for (const change of [
      (p: ReturnType<typeof row>) => {
        p.origin = undefined;
      },
      (p: ReturnType<typeof row>) => {
        p.facingDegrees = NaN;
      },
      (p: ReturnType<typeof row>) => {
        p.pointLight!.color = 'bad';
      },
    ]) {
      const p = row();
      change(p);
      expect(() => assertPropPresentation(p)).toThrow();
    }
    expect(() => applyPropPresentations([], [row(), row()])).toThrow(
      /Duplicate/
    );
    const door = row();
    door.doorId = 'actual/gate';
    const atlas = create(GetAtlasResponseSchema, {
      structuralDoors: [{ id: 'actual/gate' }],
    });
    expect(() =>
      applyPropPresentations([], [door], atlas.structuralDoors)
    ).toThrow(/Duplicate/);
    expect(() =>
      assertPropSightings([
        create(PropSightingSchema, {
          observedEmpty: true,
          presentation: row(),
        }),
      ])
    ).toThrow(/conflicting/);
  });
});
