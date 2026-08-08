import {
  coordToKey,
  cubeToWorld,
  HEX_SIZE,
  hexEdgeBetween,
} from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import type { ConnectorDoc } from '../dungeonYaml';
import { cubeAtColRow } from '../hexLayout';
import {
  facingCutawayHeight,
  frontDirection,
  resolveDoorLocked,
  resolveWallPieceFacing,
} from './wallPieceHelpers';

describe('frontDirection — the same frontX/frontZ convention facingCorrectedRotationY derives inline', () => {
  it('rotationY=0 points along +z (frontX=sin(0)=0, frontZ=cos(0)=1)', () => {
    const front = frontDirection(0);
    expect(front.x).toBeCloseTo(0, 10);
    expect(front.z).toBeCloseTo(1, 10);
  });

  it('rotationY=PI/2 points along +x', () => {
    const front = frontDirection(Math.PI / 2);
    expect(front.x).toBeCloseTo(1, 10);
    expect(front.z).toBeCloseTo(0, 10);
  });
});

describe('resolveWallPieceFacing — which side of the wall is actually walkable floor', () => {
  // A real hex edge between two adjacent cells (SAME primitive
  // DungeonPreview3D.tsx's own `edgeBetweenCells` uses), not a hand-picked
  // world point — proves the probe distance/direction against genuine hex
  // geometry rather than an arbitrary synthetic case.
  const fromCell = cubeAtColRow(5, 5);
  const toCell = cubeAtColRow(6, 5);
  const edge = hexEdgeBetween(fromCell, toCell, HEX_SIZE);
  const fromKey = coordToKey(fromCell);
  const toKey = coordToKey(toCell);

  it('faces toward the "from" side when only it is open', () => {
    const facing = resolveWallPieceFacing(
      edge.mid.x,
      edge.mid.z,
      edge.rotationY,
      (key) => key === fromKey
    );
    const fromCenter = cubeToWorld(fromCell, HEX_SIZE);
    const towardFrom = {
      x: fromCenter.x - edge.mid.x,
      z: fromCenter.z - edge.mid.z,
    };
    const dot = facing.x * towardFrom.x + facing.z * towardFrom.z;
    expect(dot).toBeGreaterThan(0);
  });

  it('faces toward the "to" side when only it is open (the reverse of the un-corrected front)', () => {
    const facing = resolveWallPieceFacing(
      edge.mid.x,
      edge.mid.z,
      edge.rotationY,
      (key) => key === toKey
    );
    const toCenter = cubeToWorld(toCell, HEX_SIZE);
    const towardTo = { x: toCenter.x - edge.mid.x, z: toCenter.z - edge.mid.z };
    const dot = facing.x * towardTo.x + facing.z * towardTo.z;
    expect(dot).toBeGreaterThan(0);
  });

  it('falls back to the un-corrected front direction when BOTH sides are open (interior wall, no single preferred side)', () => {
    const facing = resolveWallPieceFacing(
      edge.mid.x,
      edge.mid.z,
      edge.rotationY,
      () => true
    );
    expect(facing).toEqual(frontDirection(edge.rotationY));
  });

  it('falls back to the un-corrected front direction when NEITHER side is open (a wall authored with no floor on either side)', () => {
    const facing = resolveWallPieceFacing(
      edge.mid.x,
      edge.mid.z,
      edge.rotationY,
      () => false
    );
    expect(facing).toEqual(frontDirection(edge.rotationY));
  });
});

describe('facingCutawayHeight — cutaway classification against a LIVE camera-ward vector', () => {
  const tall = 2.4;
  const stub = 0.3;

  it('always returns tallHeight when cutaway is disabled, regardless of facing/ward', () => {
    const height = facingCutawayHeight(
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      false,
      tall,
      stub
    );
    expect(height).toBe(tall);
  });

  it('always returns tallHeight when cameraWard has not been measured yet (null)', () => {
    const height = facingCutawayHeight({ x: 1, z: 0 }, null, true, tall, stub);
    expect(height).toBe(tall);
  });

  it('stubs when the walkable-side facing points AWAY from the camera (the camera is on the far side of this wall from the room)', () => {
    // facing points toward the room (+x); camera-ward points the OPPOSITE
    // way (-x) — the camera sits on the wall's far/outward side, meaning
    // this wall is between the camera and the room's interior.
    const height = facingCutawayHeight(
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      true,
      tall,
      stub
    );
    expect(height).toBe(stub);
  });

  it('stays tall when the walkable-side facing points TOWARD the camera (the camera is already inside/beyond the room, this wall is the far wall)', () => {
    const height = facingCutawayHeight(
      { x: 1, z: 0 },
      { x: 1, z: 0 },
      true,
      tall,
      stub
    );
    expect(height).toBe(tall);
  });

  it('stays tall at exactly a perpendicular ward (dot=0) — the strict "<0" boundary matches effectiveWallHeight\'s own ">0" boundary algebraically', () => {
    const height = facingCutawayHeight(
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      true,
      tall,
      stub
    );
    expect(height).toBe(tall);
  });
});

describe('resolveDoorLocked — locked state only resolvable via a server-truth connector correlation', () => {
  const connectors: ConnectorDoc[] = [
    { from: 'a', to: 'b', locked: null },
    { from: 'b', to: 'c', locked: { dc: 15, ability: 'STR' } },
  ];

  it('returns false when there is no connector correlation at all (an authored doc.walls/wallLines door)', () => {
    expect(resolveDoorLocked(connectors, null)).toBe(false);
  });

  it('returns false for a real connector with no locked: block', () => {
    expect(resolveDoorLocked(connectors, 0)).toBe(false);
  });

  it('returns true for a real connector carrying a locked: block', () => {
    expect(resolveDoorLocked(connectors, 1)).toBe(true);
  });

  it('returns false for an out-of-range index rather than throwing', () => {
    expect(resolveDoorLocked(connectors, 99)).toBe(false);
  });
});
