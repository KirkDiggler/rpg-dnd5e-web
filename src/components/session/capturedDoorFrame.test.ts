import { wallWithCapturedFrameSpans } from '@/concepts/world-building/doorwayPlacement';
import { create } from '@bufbuild/protobuf';
import { GetAtlasResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AtlasStructuralDoorSchema,
  AtlasStructuralWallSchema,
  StructuralWallOpeningsReplacementSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { applyStructuralRecords } from './applyReveal';
import {
  assertStructuralLayoutIntegrity,
  sceneUnitsPerFoot,
  structuralLayoutRender,
} from './structuralLayout';
const door = () =>
  create(AtlasStructuralDoorSchema, {
    id: 'door',
    ref: 'opaque:door',
    from: { x: 4, y: 0 },
    to: { x: 6, y: 0 },
    height: 3,
    thickness: 0.3,
    framePresentation: {
      span: { before: 3, after: 3 },
      faceFinishes: [
        { side: 'positive-z', materialRef: 'opaque:gray', phaseU: 0 },
      ],
    },
  });
const wall = () =>
  create(AtlasStructuralWallSchema, {
    id: 'wall',
    ref: 'opaque:wall',
    from: { x: 0, y: 0 },
    to: { x: 10, y: 0 },
    height: 3,
    thickness: 0.3,
    openings: [
      { id: 'gap', position: 5, width: 2, frameSpan: { before: 3, after: 3 } },
    ],
  });
describe('captured frame render adapters', () => {
  it('keeps independent frame facts through a parent-later reveal and rejects malformed sibling changes atomically', () => {
    const initial = create(GetAtlasResponseSchema, {
      structuralDoors: [door()],
    });
    const introduced = wall();
    const next = applyStructuralRecords(initial, [introduced], []);
    expect(next.structuralDoors[0].framePresentation).toEqual(
      initial.structuralDoors[0].framePresentation
    );
    introduced.openings[0].frameSpan!.before = 99;
    expect(next.structuralWalls[0].openings[0].frameSpan!.before).toBe(3);
    const bad = door();
    bad.framePresentation!.faceFinishes[0].phaseU = undefined;
    expect(() =>
      applyStructuralRecords(
        next,
        [],
        [bad],
        [
          create(StructuralWallOpeningsReplacementSchema, {
            wallId: 'wall',
            openings: [],
          }),
        ]
      )
    ).toThrow(/phaseU/);
    expect(next.structuralWalls[0].openings).toHaveLength(1);
  });
  it('renders an independently supplied door without a wall and detaches/scales only lengths', () => {
    const source = door(),
      result = structuralLayoutRender([], [source], 1),
      scale = sceneUnitsPerFoot(1);
    expect(result.diagnostics).toEqual([]);
    expect(result.doors).toHaveLength(1);
    const captured = result.doors[0].framePresentation;
    expect(captured).toBeDefined();
    expect(captured!.span.before).toBeCloseTo(3 * scale);
    expect(captured!.faceFinishes[0].phaseU).toBe(0);
    captured!.span.before = 99;
    captured!.faceFinishes[0].materialRef = 'changed';
    expect(source.framePresentation!.span!.before).toBe(3);
    expect(source.framePresentation!.faceFinishes[0].materialRef).toBe(
      'opaque:gray'
    );
    expect(result.doors[0]).not.toHaveProperty('wallId');
  });
  it('cuts the supplied visual span without enlarging the authoritative aperture', () => {
    const source = wall(),
      result = structuralLayoutRender([source], [], 1),
      scale = sceneUnitsPerFoot(1);
    const surface = result.walls[0].surface;
    expect(surface.openings[0].width).toBeCloseTo(2 * scale);
    expect(wallWithCapturedFrameSpans(surface).openings[0].width).toBeCloseTo(
      6 * scale
    );
    expect(surface.openings[0].width).toBeCloseTo(2 * scale);
  });
  it('refuses missing phase and overflowing cuts atomically rather than filling from a parent', () => {
    const bad = door();
    bad.framePresentation!.faceFinishes[0].phaseU = undefined;
    expect(() =>
      assertStructuralLayoutIntegrity({ walls: [wall()], doors: [bad] })
    ).toThrow(/phaseU/);
    const malformed = wall();
    malformed.openings[0].frameSpan!.before = 9;
    expect(() =>
      assertStructuralLayoutIntegrity({ walls: [malformed], doors: [] })
    ).toThrow(/fit within/);
    const legacy = door();
    legacy.framePresentation = undefined;
    expect(
      structuralLayoutRender([], [legacy], 1).doors[0].framePresentation
    ).toBeUndefined();
  });
});
