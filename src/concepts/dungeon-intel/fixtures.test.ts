// @vitest-environment node
import { coordToKey } from '@/components/hex-grid/hexMath';
import { DoorState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  ENTRY_DOOR,
  FURTHER_DOOR,
  HEIRLOOM,
  STEPS,
  type ObserverSnapshot,
} from './fixtures';
import { renderSnapshot } from './renderSnapshot';

const view = (step: string, observer: 'A' | 'B' = 'A'): ObserverSnapshot => {
  const found = STEPS.find((entry) => entry.id === step);
  if (!found) throw new Error(`Unknown test step ${step}`);
  return found.views[observer];
};

describe('explicit dungeon-intel supplied answers', () => {
  it('starts both characters with room 1 only across every atlas disclosure channel', () => {
    for (const observer of ['A', 'B'] as const) {
      const snapshot = view('start', observer);
      expect(snapshot.atlas.cells).toHaveLength(20);
      expect(snapshot.atlas.cells.every((cell) => cell.x <= 4)).toBe(true);
      expect(snapshot.atlas.regions.map((region) => region.id)).toEqual([
        'room-1',
      ]);
      expect(snapshot.atlas.props.map((prop) => prop.id)).toEqual(['bookcase']);
      expect(snapshot.atlas.segments).toHaveLength(6);
      expect(snapshot.atlas.boundaries).toEqual([]);
      expect(snapshot.atlas.placed).toEqual([]);
      expect(snapshot.atlas.sealed).toEqual([]);
      expect(snapshot.atlas.exits).toEqual([]);
      expect(snapshot.atlas.doorways.map((door) => door.connection)).toEqual([
        ENTRY_DOOR,
      ]);
      expect(snapshot.sightings).toEqual([]);
      expect(snapshot.props).toEqual([]);
      expect(renderSnapshot(snapshot).scene.floorTiles.size).toBe(20);
      expect(snapshot.doors[0].info.state).toBe(DoorState.CLOSED);
      expect(snapshot.doors[0].observation).toBe('current');
      expect(renderSnapshot(snapshot).markers[0].knowledge).toBe('visible');
    }
  });

  it('delivers observed room 2 and permitted fixed/mutable appearances to A, not obstructed B', () => {
    const a = renderSnapshot(view('look'));
    const b = renderSnapshot(view('look', 'B'));
    expect(a.scene.floorTiles.size).toBe(44);
    expect(a.scene.props.map((prop) => prop.id)).toEqual([
      'bookcase',
      'fixed-pillar',
      HEIRLOOM,
    ]);
    expect(a.members[0].remembered).toBe(false);
    expect(a.scene.doorGaps.map((door) => door.connection)).toEqual([
      ENTRY_DOOR,
      FURTHER_DOOR,
    ]);
    expect(b.scene.floorTiles.size).toBe(20);
    expect(b.scene.props.map((prop) => prop.id)).toEqual(['bookcase']);
    expect(b.members).toEqual([]);
    expect(b.doors.get(ENTRY_DOOR)?.state).toBe(DoorState.CLOSED);
    expect(b.markers[0].knowledge).toBe('remembered');
    expect(b.doors.has(FURTHER_DOOR)).toBe(false);
  });

  it('retains fixed geometry while supplied mutable observations become remembered', () => {
    const before = renderSnapshot(view('look'));
    const after = renderSnapshot(view('withdraw'));
    expect(after.scene.floorTiles).toEqual(before.scene.floorTiles);
    expect(after.scene.wallRuns).toEqual(before.scene.wallRuns);
    expect(after.scene.props).toEqual(before.scene.props);
    expect(after.members[0].remembered).toBe(true);
    expect(
      after.markers.every((marker) => marker.knowledge === 'remembered')
    ).toBe(true);
  });

  it('supplies B’s own current discovery at step 4 without refreshing A', () => {
    const snapshot = view('b-look', 'B');
    const rendered = renderSnapshot(snapshot);
    expect(snapshot.observer).toBe('B');
    expect(rendered.scene.floorTiles.size).toBe(44);
    expect(rendered.scene.props.map((prop) => prop.id)).toEqual([
      'bookcase',
      'fixed-pillar',
      HEIRLOOM,
    ]);
    expect(rendered.doors.get(ENTRY_DOOR)?.state).toBe(DoorState.OPEN);
    expect(rendered.scene.doorGaps.map((door) => door.connection)).toEqual([
      ENTRY_DOOR,
      FURTHER_DOOR,
    ]);
    expect(snapshot.doors.every((door) => door.observation === 'current')).toBe(
      true
    );
    expect(snapshot.props[0].observation).toBe('current');
    expect(rendered.members[0].remembered).toBe(false);
    expect(
      rendered.markers.every((marker) => marker.knowledge === 'visible')
    ).toBe(true);
    expect(view('b-look')).toBe(view('withdraw'));
  });

  it('does not refresh A from B’s observations, pickup or unseen door close', () => {
    expect(view('withdraw')).toBe(view('b-look'));
    expect(view('withdraw')).toBe(view('unseen-change'));
    const a = renderSnapshot(view('unseen-change'));
    const b = renderSnapshot(view('unseen-change', 'B'));
    expect(a.scene.props.some((prop) => prop.id === HEIRLOOM)).toBe(true);
    expect(a.doors.get(ENTRY_DOOR)?.state).toBe(DoorState.OPEN);
    expect(b.scene.props.some((prop) => prop.id === HEIRLOOM)).toBe(false);
    expect(b.doors.get(ENTRY_DOOR)?.state).toBe(DoorState.CLOSED);
  });

  it('explicit empty observation corrects location, not existence or carrier/destination', () => {
    const snapshot = view('return');
    const rendered = renderSnapshot(snapshot);
    expect(snapshot.props[0].id).toBe(HEIRLOOM);
    expect(snapshot.props[0].placement).toBeUndefined();
    expect(Object.keys(snapshot.props[0]).sort()).toEqual([
      'id',
      'name',
      'observation',
    ]);
    expect(
      snapshot.observedEmpty.map((position) => [position.x, position.y])
    ).toEqual([[8, 1]]);
    expect(rendered.scene.props.some((prop) => prop.id === HEIRLOOM)).toBe(
      false
    );
    expect(
      rendered.markers.find((marker) => marker.id === 'observed-empty-0')?.label
    ).toBe('Observed empty');
    expect(rendered.members.map((member) => member.subject)).toEqual([
      'skeleton-1',
    ]);
    // Reopening is current for both characters looking at the entry now.
    expect(
      renderSnapshot(view('return', 'B')).doors.get(ENTRY_DOOR)?.state
    ).toBe(DoorState.OPEN);
  });

  it('a visible further door never supplies the interior beyond it in any snapshot', () => {
    for (const step of STEPS)
      for (const snapshot of Object.values(step.views)) {
        expect(snapshot.atlas.cells.every((cell) => cell.x <= 10)).toBe(true);
        expect(
          snapshot.atlas.regions.every((region) => region.id !== 'room-3')
        ).toBe(true);
        expect(
          snapshot.atlas.regions
            .flatMap((region) => region.cells)
            .every((cell) => cell.x <= 10)
        ).toBe(true);
        expect(
          snapshot.atlas.props.every((prop) => prop.at && prop.at.x <= 10)
        ).toBe(true);
        expect(
          snapshot.atlas.segments.every(
            (segment) =>
              segment.from &&
              segment.to &&
              segment.from.q <= 11.25 &&
              segment.to.q <= 11.25
          )
        ).toBe(true);
        const scene = renderSnapshot(snapshot).scene;
        expect(scene.floorTiles.has(coordToKey({ x: 11, y: -12, z: 1 }))).toBe(
          false
        );
        expect(scene.roomScene).toBeUndefined();
        for (const testimony of snapshot.props) {
          if (!testimony.placement) continue;
          expect(testimony.placement.at).toBeDefined();
          expect(testimony.placement.at!.x).toBeLessThanOrEqual(10);
        }
        // Both fixed scenery and provisional mutable placement channels stay
        // on supplied discovered floor, never floating into unknown space.
        expect(
          scene.props.every((prop) =>
            scene.floorTiles.has(coordToKey(prop.position))
          )
        ).toBe(true);
      }
  });

  it('replaces snapshots backwards without accumulating discovery or mutating fixtures', () => {
    const pristine = structuredClone(STEPS);
    renderSnapshot(view('return'));
    renderSnapshot(view('b-look', 'B'));
    const start = renderSnapshot(view('start'));
    expect(start.scene.floorTiles.size).toBe(20);
    expect(start.scene.props.some((prop) => prop.id === HEIRLOOM)).toBe(false);
    expect(STEPS).toEqual(pristine);
  });
});
