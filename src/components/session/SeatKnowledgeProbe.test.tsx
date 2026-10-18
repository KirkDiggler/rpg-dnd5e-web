import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cellKnowledge } from './cellKnowledge';
import {
  ATLAS_CELLS,
  BEHIND_JAMB,
  VISIBLE_AFTER_LEAVING,
} from './fogCellBlock.fixture';
import { SeatKnowledgeProbe } from './SeatKnowledgeProbe';
import { watchZoneCells } from './watchZoneCells';

describe('SeatKnowledgeProbe — the walk’s DOM observable (rpg-project#586)', () => {
  it('lists seen and remembered cells and never an absent one', () => {
    render(
      <SeatKnowledgeProbe
        knowledge={cellKnowledge(ATLAS_CELLS, VISIBLE_AFTER_LEAVING)}
      />
    );
    const probe = screen.getByTestId('seat-knowledge');
    expect(probe.dataset.seen).toBe('4');
    expect(probe.dataset.remembered).toBe('3');
    expect(probe.dataset.seenCells?.split(';')).toContain('0,0,0');
    expect(probe.dataset.rememberedCells?.split(';')).toContain('4,-4,0');
    const all = `${probe.dataset.seenCells};${probe.dataset.rememberedCells}`;
    for (const c of BEHIND_JAMB) {
      expect(all.split(';')).not.toContain(`${c.x},${-c.x - c.y},${c.y}`);
    }
  });

  it('lists the red floor cells the floor tints, and none when no zones were sent', () => {
    const knowledge = cellKnowledge(ATLAS_CELLS, VISIBLE_AFTER_LEAVING);
    const { unmount } = render(
      <SeatKnowledgeProbe
        knowledge={knowledge}
        watchZoneCells={watchZoneCells([{ cells: [ATLAS_CELLS[0]!] }])}
      />
    );
    const c = ATLAS_CELLS[0]!;
    expect(
      screen.getByTestId('seat-knowledge').dataset.watchZoneCells?.split(';')
    ).toEqual([`${c.x},${-c.x - c.y},${c.y}`]);
    unmount();
    render(
      <SeatKnowledgeProbe
        knowledge={knowledge}
        watchZoneCells={watchZoneCells([])}
      />
    );
    expect(screen.getByTestId('seat-knowledge').dataset.watchZoneCells).toBe(
      ''
    );
  });
});
