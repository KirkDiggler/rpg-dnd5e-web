import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyDungeon, placeAt, type DungeonDoc } from './dungeonYaml';
import { fromOffset } from './hexOffset';
import { Inspector } from './Inspector';

const p = (c: number, r: number) => fromOffset('pointy', [c, r]);

function propDoc(
  orientation: DungeonDoc['orientation'] = 'pointy'
): DungeonDoc {
  let doc = emptyDungeon(orientation);
  doc = { ...doc, regions: [{ ...doc.regions[0], cells: [p(0, 0)] }] };
  doc = placeAt(doc, { ref: 'dnd5e:props:pillar', at: p(0, 0) });
  return doc;
}

function noop() {}

function mountPlacement(
  doc: DungeonDoc,
  overrides: Partial<{
    onPlacement: (index: number, patch: Record<string, unknown>) => void;
  }> = {}
) {
  return render(
    <Inspector
      doc={doc}
      selection={{ kind: 'placement', index: 0 }}
      onDungeon={noop}
      onRegion={noop}
      onRemoveRegion={noop}
      onDoor={noop}
      onRemoveDoor={noop}
      onPlacement={overrides.onPlacement ?? noop}
      onRemovePlacement={noop}
      onRemoveWall={noop}
    />
  );
}

describe('PlacementPanel facing/offset (rpg-project#261)', () => {
  it('draws the pointy-top six-name compass and none defaults active', () => {
    mountPlacement(propDoc('pointy'));
    for (const name of ['e', 'se', 'sw', 'w', 'nw', 'ne']) {
      expect(screen.getByTestId(`facing-${name}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('facing-n')).toBeNull();
    expect(screen.getByTestId('facing-none').className).toContain(
      'dg-tool--on'
    );
  });

  it('draws the flat-top six-name compass under a flat dungeon', () => {
    mountPlacement(propDoc('flat'));
    for (const name of ['n', 's', 'ne', 'nw', 'se', 'sw']) {
      expect(screen.getByTestId(`facing-${name}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('facing-e')).toBeNull();
  });

  it('clicking a facing button reports that name; clicking none clears it', () => {
    const onPlacement = vi.fn();
    mountPlacement(propDoc(), { onPlacement });
    fireEvent.click(screen.getByTestId('facing-ne'));
    expect(onPlacement).toHaveBeenLastCalledWith(0, { facing: 'ne' });
    fireEvent.click(screen.getByTestId('facing-none'));
    expect(onPlacement).toHaveBeenLastCalledWith(0, { facing: undefined });
  });

  it('the active facing button is highlighted from the document', () => {
    const doc = propDoc();
    const faced = { ...doc, place: [{ ...doc.place[0], facing: 'sw' }] };
    mountPlacement(faced);
    expect(screen.getByTestId('facing-sw').className).toContain('dg-tool--on');
    expect(screen.getByTestId('facing-none').className).not.toContain(
      'dg-tool--on'
    );
  });

  it('every compass button carries aria-pressed and an accessible name (Copilot review, PR #795)', () => {
    const doc = propDoc();
    const faced = { ...doc, place: [{ ...doc.place[0], facing: 'sw' }] };
    mountPlacement(faced);
    expect(screen.getByTestId('facing-sw').getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByTestId('facing-none').getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(screen.getByTestId('facing-none').getAttribute('aria-label')).toBe(
      'facing: asset default'
    );
    expect(screen.getByTestId('facing-ne').getAttribute('aria-label')).toBe(
      'facing: ne'
    );
  });

  it('offset steppers report a clamped [x, y] tuple; center clears it', () => {
    const onPlacement = vi.fn();
    mountPlacement(propDoc(), { onPlacement });
    fireEvent.change(screen.getByLabelText('x'), { target: { value: '0.3' } });
    expect(onPlacement).toHaveBeenLastCalledWith(0, { offset: [0.3, 0] });
    fireEvent.change(screen.getByLabelText('y'), {
      target: { value: '-0.9' },
    });
    // clamped to the [-0.5, 0.5] bound
    expect(onPlacement).toHaveBeenLastCalledWith(0, { offset: [0, -0.5] });
    fireEvent.click(screen.getByText('center'));
    expect(onPlacement).toHaveBeenLastCalledWith(0, { offset: undefined });
  });

  it('monster placements show neither facing nor offset controls', () => {
    let doc = emptyDungeon();
    doc = { ...doc, regions: [{ ...doc.regions[0], cells: [p(0, 0)] }] };
    doc = placeAt(doc, { ref: 'dnd5e:monsters:zombie', at: p(0, 0) });
    mountPlacement(doc);
    expect(screen.queryByTestId('facing-compass')).toBeNull();
    expect(screen.queryByLabelText('x')).toBeNull();
  });
});

describe('wall selection (#804)', () => {
  it('shows "Wall — N edges" for the selected run and deletes all of them', () => {
    let doc = emptyDungeon('pointy');
    doc = {
      ...doc,
      regions: [{ ...doc.regions[0], cells: [p(0, 0), p(1, 0), p(0, 1)] }],
      walls: [
        [p(0, 0), p(1, 0)],
        [p(0, 0), p(0, 1)],
      ],
    };
    const onRemoveWall = vi.fn();
    render(
      <Inspector
        doc={doc}
        selection={{ kind: 'wall', edges: doc.walls }}
        onDungeon={noop}
        onRegion={noop}
        onRemoveRegion={noop}
        onDoor={noop}
        onRemoveDoor={noop}
        onPlacement={noop}
        onRemovePlacement={noop}
        onRemoveWall={onRemoveWall}
      />
    );
    expect(screen.getByTestId('wall-panel').textContent).toContain(
      'Wall — 2 edges'
    );
    fireEvent.click(screen.getByRole('button', { name: /delete wall/i }));
    expect(onRemoveWall).toHaveBeenCalledWith(doc.walls);
  });

  it('a wall selection whose edges are all gone falls back to the dungeon panel', () => {
    const doc = emptyDungeon('pointy');
    render(
      <Inspector
        doc={doc}
        selection={{ kind: 'wall', edges: [[p(0, 0), p(1, 0)]] }}
        onDungeon={noop}
        onRegion={noop}
        onRemoveRegion={noop}
        onDoor={noop}
        onRemoveDoor={noop}
        onPlacement={noop}
        onRemovePlacement={noop}
        onRemoveWall={noop}
      />
    );
    expect(screen.getByTestId('dungeon-panel')).toBeTruthy();
  });
});
