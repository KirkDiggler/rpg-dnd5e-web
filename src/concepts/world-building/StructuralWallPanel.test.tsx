import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  setDoorBindingState,
  withDoorBinding,
  type DoorBindings,
} from './doorBindingEdits';
import {
  attachDoorToOpening,
  removeDoorFromOpening,
  swapOpeningDoorAsset,
} from './structuralDoorEditing';
import { wallOpeningPoint } from './structuralWallGeometry';
import {
  StructuralWallPanel,
  type WallDoorMutation,
} from './StructuralWallPanel';
import type { StructuralWall } from './structuralWalls';

const WALL_ASSET = 'dnd5e:env:dark-fortress:45_wall_01';
const DOOR_ASSET = 'dnd5e:env:dark-fortress:wall_door_double_01';

function wall(overrides: Partial<StructuralWall> = {}): StructuralWall {
  return {
    id: 'wall-1',
    label: 'North wall',
    line: { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
    openings: [{ id: 'opening-1', position: 7, width: 2 }],
    appearance: {
      assetRef: WALL_ASSET,
      height: 3,
      thickness: 0.3,
      elevation: 0,
    },
    blocker: {
      footprint: { width: 12, depth: 0.5, offsetX: 1, offsetZ: -0.2 },
      blocksMovement: false,
      blocksLineOfSight: true,
    },
    ...overrides,
  };
}

function wallWithDoor(overrides: Partial<StructuralWall> = {}): StructuralWall {
  return wall({
    openings: [
      {
        id: 'opening-1',
        position: 7,
        width: 2,
        door: { id: 'door-1', assetRef: DOOR_ASSET },
      },
    ],
    ...overrides,
  });
}

/** A functional harness mirroring the concept's atomic door mutation so the
 * panel's real attach/swap/remove/state controls exercise the shared helpers. */
function Harness({
  initial = [wall()],
  initialBindings,
  accepted = true,
}: {
  initial?: StructuralWall[];
  initialBindings?: DoorBindings;
  accepted?: boolean;
}) {
  const [walls, setWalls] = useState(initial);
  const [bindings, setBindings] = useState<DoorBindings | undefined>(
    initialBindings
  );
  const [selectedWallId, setSelectedWallId] = useState<string | null>(
    initial[0]?.id ?? null
  );
  const [notice, setNotice] = useState('');
  const mutate = (mutation: WallDoorMutation): boolean => {
    if (!accepted) return false;
    const wall = walls.find((entry) => entry.id === mutation.wallId);
    if (!wall) return false;
    let nextWall = wall;
    let nextBindings = bindings;
    switch (mutation.kind) {
      case 'attach':
        nextWall = attachDoorToOpening(wall, {
          openingId: mutation.openingId,
          doorId: 'door-1',
          assetRef: mutation.assetRef,
        });
        nextBindings = withDoorBinding(
          nextBindings,
          'door-1',
          setDoorBindingState(undefined, 'closed')
        );
        break;
      case 'swap':
        nextWall = swapOpeningDoorAsset(wall, {
          openingId: mutation.openingId,
          assetRef: mutation.assetRef,
        });
        break;
      case 'remove': {
        const doorId = wall.openings.find(
          (entry) => entry.id === mutation.openingId
        )?.door?.id;
        nextBindings = withDoorBinding(nextBindings, doorId ?? '', undefined);
        nextWall = removeDoorFromOpening(wall, mutation.openingId);
        break;
      }
      case 'binding': {
        const doorId = wall.openings.find(
          (entry) => entry.id === mutation.openingId
        )?.door?.id;
        nextBindings = withDoorBinding(
          nextBindings,
          doorId ?? '',
          mutation.binding
        );
        break;
      }
    }
    setWalls((current) =>
      current.map((entry) => (entry.id === wall.id ? nextWall : entry))
    );
    setBindings(nextBindings);
    return true;
  };
  return (
    <>
      <StructuralWallPanel
        walls={walls}
        selectedWallId={selectedWallId}
        onSelectWall={setSelectedWallId}
        assetOptions={[
          { ref: WALL_ASSET, label: '45 Wall 01' },
          { ref: 'dnd5e:env:dark-fantasy:pillar_01', label: 'Pillar 01' },
        ]}
        doorAssetOptions={[{ ref: DOOR_ASSET, label: 'Double Door' }]}
        doorBindings={bindings}
        armedAssetRef={WALL_ASSET}
        onArmedAssetChange={vi.fn()}
        snapEnabled={false}
        onSnapChange={vi.fn()}
        onEdit={(next) => {
          if (!accepted) return false;
          setWalls((current) =>
            current.map((entry) => (entry.id === next.id ? next : entry))
          );
          return true;
        }}
        onRemoveWall={vi.fn()}
        onDoorMutation={mutate}
        onNotice={setNotice}
      />
      <output data-testid="walls">{JSON.stringify(walls)}</output>
      <output data-testid="bindings">{JSON.stringify(bindings ?? null)}</output>
      <output data-testid="notice">{notice}</output>
    </>
  );
}

const value = (): StructuralWall[] =>
  JSON.parse(screen.getByTestId('walls').textContent!);

function selected(): StructuralWall {
  return value().find((entry) => entry.id === 'wall-1')!;
}

describe('StructuralWallPanel', () => {
  it('applies an exact length and carries the opening and blocker end margins', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Exact length'), {
      target: { value: '14' },
    });
    fireEvent.click(screen.getByText('Apply length'));
    const next = selected();
    expect(next.line.end.x).toBeCloseTo(14);
    expect(next.openings).toEqual([{ id: 'opening-1', position: 7, width: 2 }]);
    expect(wallOpeningPoint({ wall: next, openingId: 'opening-1' })).toEqual({
      x: 7,
      z: 0,
    });
    expect(next.blocker.footprint.width).toBeCloseTo(16);
    expect(next.blocker.footprint.offsetX).toBe(1);
    expect(next.blocker.footprint.offsetZ).toBe(-0.2);
    expect(next.blocker.blocksLineOfSight).toBe(true);
    expect(screen.getByTestId('structural-wall-length').textContent).toBe(
      'Applied length 14'
    );
  });

  it('stops a shortening edit at the doorway edge and reports the clamp', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Exact length'), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByText('Apply length'));
    const next = selected();
    expect(next.line.end.x).toBeCloseTo(8);
    expect(next.openings.map((opening) => opening.id)).toEqual(['opening-1']);
    expect(screen.getByTestId('structural-wall-length').textContent).toBe(
      'Applied length 8 (clamped at the doorway edge)'
    );
  });

  it('rebases opening distances when the starting end moves', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Length endpoint'), {
      target: { value: 'start' },
    });
    fireEvent.change(screen.getByLabelText('Exact length'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByText('Apply length'));
    const next = selected();
    expect(next.line.start.x).toBeCloseTo(-2);
    expect(next.openings[0]).toEqual({
      id: 'opening-1',
      position: 9,
      width: 2,
    });
    expect(wallOpeningPoint({ wall: next, openingId: 'opening-1' })).toEqual({
      x: 7,
      z: 0,
    });
  });

  it('edits appearance without touching blocker, openings or walkability', () => {
    render(<Harness />);
    const before = selected();
    fireEvent.change(screen.getByLabelText('Appearance height'), {
      target: { value: '4.5' },
    });
    fireEvent.change(screen.getByLabelText('Wall label'), {
      target: { value: 'South wall' },
    });
    fireEvent.click(screen.getByText('Apply appearance'));
    const next = selected();
    expect(next.appearance.height).toBe(4.5);
    expect(next.label).toBe('South wall');
    expect(next.blocker).toEqual(before.blocker);
    expect(next.openings).toEqual(before.openings);
    expect(next.line).toEqual(before.line);
  });

  it('adds a doorless opening and refuses an overlapping one without mutating', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('New opening id'), {
      target: { value: 'window' },
    });
    fireEvent.change(screen.getByLabelText('New opening position'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText('New opening width'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByText('Add opening'));
    expect(selected().openings).toEqual([
      { id: 'opening-1', position: 7, width: 2 },
      { id: 'window', position: 3, width: 2 },
    ]);

    fireEvent.change(screen.getByLabelText('New opening id'), {
      target: { value: 'clash' },
    });
    fireEvent.change(screen.getByLabelText('New opening position'), {
      target: { value: '3.5' },
    });
    fireEvent.change(screen.getByLabelText('New opening width'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByText('Add opening'));
    expect(selected().openings).toHaveLength(2);
    expect(screen.getByTestId('notice').textContent).toMatch(/overlap/);
  });

  it('moves and rotates the wall while carrying a noncentral opening', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Move X'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Move Z'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByText('Apply move'));
    let next = selected();
    expect(next.line.start).toEqual({ x: 2, z: 3 });
    expect(wallOpeningPoint({ wall: next, openingId: 'opening-1' })).toEqual({
      x: 9,
      z: 3,
    });

    fireEvent.change(screen.getByLabelText('Rotate degrees'), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByText('Apply rotation'));
    next = selected();
    const point = wallOpeningPoint({ wall: next, openingId: 'opening-1' });
    expect(point.x).toBeCloseTo(7);
    expect(point.z).toBeCloseTo(5);
  });

  it('reports engine-independent snap state through the shared control', () => {
    const onSnapChange = vi.fn();
    render(
      <StructuralWallPanel
        walls={[wall()]}
        selectedWallId="wall-1"
        onSelectWall={vi.fn()}
        assetOptions={[{ ref: WALL_ASSET, label: '45 Wall 01' }]}
        doorAssetOptions={[]}
        doorBindings={undefined}
        armedAssetRef={null}
        onArmedAssetChange={vi.fn()}
        snapEnabled={false}
        onSnapChange={onSnapChange}
        onEdit={vi.fn(() => true)}
        onRemoveWall={vi.fn()}
        onDoorMutation={vi.fn(() => true)}
      />
    );
    fireEvent.click(
      screen.getByLabelText('Snap to hex centres, corners and side midpoints')
    );
    expect(onSnapChange).toHaveBeenCalledWith(true);
    // Drawing is disabled and says so until an asset is armed.
    expect(screen.getByText(/Drawing is disabled/i)).toBeTruthy();
  });

  it('attaches a door to a bare opening, minting identity, a closed binding and leaving the gap', () => {
    render(<Harness />);
    fireEvent.change(
      screen.getByLabelText('Door asset for opening opening-1'),
      { target: { value: DOOR_ASSET } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Attach door' }));
    const opening = selected().openings[0]!;
    expect(opening.door).toEqual({ id: 'door-1', assetRef: DOOR_ASSET });
    // The opening itself (the gap) is unchanged.
    expect(opening.position).toBe(7);
    expect(opening.width).toBe(2);
    // A freshly attached door starts CLOSED, through the engine's grammar.
    expect(JSON.parse(screen.getByTestId('bindings').textContent!)).toEqual({
      'door-1': { closed: true },
    });
    expect(screen.getByTestId('wall-door-state-opening-1').textContent).toBe(
      'closed'
    );
  });

  it('swaps a door asset retaining its id and its authored state', () => {
    render(
      <Harness
        initial={[wallWithDoor()]}
        initialBindings={{ 'door-1': { closed: true } }}
      />
    );
    // The harness only offers one door asset, so swapping to the same ref must
    // still keep identity and state.
    fireEvent.change(
      screen.getByLabelText('Door asset for opening opening-1'),
      { target: { value: DOOR_ASSET } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Swap door asset' }));
    expect(selected().openings[0]!.door).toEqual({
      id: 'door-1',
      assetRef: DOOR_ASSET,
    });
    expect(JSON.parse(screen.getByTestId('bindings').textContent!)).toEqual({
      'door-1': { closed: true },
    });
  });

  it('edits door state through the shared controls and removes the door while keeping the gap', () => {
    render(
      <Harness initial={[wallWithDoor()]} initialBindings={{ 'door-1': {} }} />
    );
    expect(screen.getByTestId('wall-door-state-opening-1').textContent).toBe(
      'open'
    );
    fireEvent.change(
      screen.getByLabelText('Door state for opening opening-1'),
      { target: { value: 'locked' } }
    );
    const locked = JSON.parse(screen.getByTestId('bindings').textContent!);
    expect(locked['door-1'].locked).toEqual([{ ability: 'str', dc: 15 }]);
    expect(screen.getByTestId('wall-door-state-opening-1').textContent).toBe(
      'locked'
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove door from opening opening-1',
      })
    );
    const opening = selected().openings[0]!;
    expect(opening.door).toBeUndefined();
    // The gap stays authored; the binding is removed with the attachment.
    expect(opening.position).toBe(7);
    expect(opening.width).toBe(2);
    expect(screen.getByTestId('bindings').textContent).toBe('null');
  });

  it('does not change the document when the door mutation is refused', () => {
    render(<Harness accepted={false} />);
    fireEvent.change(
      screen.getByLabelText('Door asset for opening opening-1'),
      { target: { value: DOOR_ASSET } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Attach door' }));
    // The document is unchanged.
    expect(selected().openings[0]!.door).toBeUndefined();
  });
});

describe('M1 legacy panel untouched length mirror', () => {
  it.each(['start', 'end'])(
    'preserves the canonical fractional %s length and still applies genuinely typed values',
    (endpoint) => {
      const original = wallWithDoor({
        line: { start: { x: 0, z: 0 }, end: { x: 3, z: 2 } },
        openings: [
          {
            id: 'opening-1',
            position: 1,
            width: 1,
            door: { id: 'door-1', assetRef: DOOR_ASSET },
          },
        ],
      });
      render(<Harness initial={[original]} />);
      expect(
        (screen.getByLabelText('Exact length') as HTMLInputElement).value
      ).toBe('3.605551');
      fireEvent.change(screen.getByLabelText('Length endpoint'), {
        target: { value: endpoint },
      });
      fireEvent.click(screen.getByText('Apply length'));
      expect(selected()).toEqual(original);
      expect(screen.getByTestId('structural-wall-length').textContent).toBe(
        'Applied length 3.605551'
      );
      fireEvent.change(screen.getByLabelText('Exact length'), {
        target: { value: '3.605552' },
      });
      fireEvent.click(screen.getByText('Apply length'));
      const changed = selected();
      expect(changed).not.toEqual(original);
      expect(changed.id).toBe(original.id);
      expect(changed.appearance).toEqual(original.appearance);
      expect(changed.openings[0].door).toEqual(original.openings[0].door);
      // A real owner wall update resets the staged token and its dirty status.
      fireEvent.click(screen.getByText('Apply length'));
      expect(selected()).toEqual(changed);
    }
  );
});
