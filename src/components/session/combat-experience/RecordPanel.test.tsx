import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RecordRow } from '../recordFeed';
import { RecordPanel } from './RecordPanel';

const WALK = 'move:01HF7YAT003RVQKEBZ99Y1AF3E';

function row(
  id: string,
  beat: string,
  act: string,
  fields: Record<string, unknown> = { beat }
): RecordRow {
  return { id, at: 3n, act, beat, fields };
}

// A guard's walk: three steps and the opportunity attack it drew, under one
// act; a line spoken elsewhere; and two answers.
const record: RecordRow[] = [
  row('01HF7YAT01', 'moved', WALK, { beat: 'moved', member: 'gate-1' }),
  row('01HF7YAT02', 'struck', WALK, {
    beat: 'struck',
    actor: 'ranger',
    amount: 6,
    attack: { roll: 14, total: 19 },
  }),
  row('01HF7YAT03', 'moved', WALK),
  row('01HF7YAT04', 'moved', WALK),
  row('01HF7YAT05', 'spoke', 'speak:01HF7YAT05X'),
  row('01HF7YAT06', 'answered', 'speak:01HF7YAT05X'),
  row('01HF7YAT07', 'answered', 'time:01HF7YAT07X'),
  row('01HF7YAT08', 'scene-opened', ''),
];

function shown(): string[] {
  const list = screen.getByRole('list', { name: 'Record' });
  return within(list)
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-record-id') ?? '');
}

const longRecord = Array.from({ length: 23 }, (_, index) =>
  row(
    `record-${String(index + 1).padStart(2, '0')}`,
    index === 22 ? 'answered' : 'moved',
    `act-${Math.floor(index / 5)}`
  )
);

describe('RecordPanel', () => {
  it('pages loaded rows and lets the reader show more without changing the feed', () => {
    render(<RecordPanel feed={{ rows: longRecord, notice: undefined }} />);
    expect(shown()).toEqual(longRecord.slice(0, 10).map((r) => r.id));
    expect(
      (
        screen.getByRole('button', {
          name: 'Previous record page',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next record page' }));
    expect(shown()).toEqual(longRecord.slice(10, 20).map((r) => r.id));
    expect(screen.getByText('11–20 of 23')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next record page' }));
    expect(shown()).toEqual(longRecord.slice(20).map((r) => r.id));
    expect(
      (
        screen.getByRole('button', {
          name: 'Next record page',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Previous record page' })
    );
    expect(shown()[0]).toBe('record-11');
    fireEvent.change(screen.getByLabelText('Record rows per page'), {
      target: { value: '25' },
    });
    expect(shown()).toHaveLength(23);
    expect(screen.getByText('1–23 of 23')).toBeTruthy();
    expect(longRecord).toHaveLength(23);
  });
  it('filters the whole loaded record before paging and resets on filter changes', () => {
    render(<RecordPanel feed={{ rows: longRecord, notice: undefined }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next record page' }));
    fireEvent.change(screen.getByLabelText('Filter by beat'), {
      target: { value: 'answered' },
    });
    expect(shown()).toEqual(['record-23']);
    fireEvent.change(screen.getByLabelText('Filter by beat'), {
      target: { value: 'absent' },
    });
    expect(screen.getByText('No records match these filters.')).toBeTruthy();
    expect(screen.getByText('0–0 of 0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(shown()[0]).toBe('record-01');
    fireEvent.click(screen.getByRole('button', { name: 'Next record page' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'act-2' })[0]);
    expect(shown()).toEqual(longRecord.slice(10, 15).map((r) => r.id));
  });
  it('keeps the current page on append and clamps it when the buffer shrinks', () => {
    const { rerender } = render(
      <RecordPanel feed={{ rows: longRecord, notice: undefined }} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next record page' }));
    const appended = [...longRecord, row('record-24', 'moved', 'act-4')];
    rerender(<RecordPanel feed={{ rows: appended, notice: undefined }} />);
    expect(shown()[0]).toBe('record-11');
    rerender(<RecordPanel feed={{ rows: [], notice: 'Record restarted' }} />);
    expect(screen.getByText('No record beats received.')).toBeTruthy();
    rerender(<RecordPanel feed={{ rows: appended, notice: undefined }} />);
    expect(shown()[0]).toBe('record-01');
  });
  it('filters by act id', () => {
    render(<RecordPanel feed={{ rows: record, notice: undefined }} />);
    expect(shown()).toHaveLength(8);
    fireEvent.change(screen.getByLabelText('Filter by act id'), {
      target: { value: WALK },
    });
    expect(shown()).toEqual([
      '01HF7YAT01',
      '01HF7YAT02',
      '01HF7YAT03',
      '01HF7YAT04',
    ]);
  });

  it("narrows to a row's act when its act id is clicked", () => {
    render(<RecordPanel feed={{ rows: record, notice: undefined }} />);
    fireEvent.click(screen.getAllByRole('button', { name: WALK })[0]!);
    expect(shown()).toEqual([
      '01HF7YAT01',
      '01HF7YAT02',
      '01HF7YAT03',
      '01HF7YAT04',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(shown()).toHaveLength(8);
  });

  it('filters by beat', () => {
    render(<RecordPanel feed={{ rows: record, notice: undefined }} />);
    fireEvent.change(screen.getByLabelText('Filter by beat'), {
      target: { value: 'answered' },
    });
    expect(shown()).toEqual(['01HF7YAT06', '01HF7YAT07']);
  });

  it('pretty-prints fields', () => {
    render(<RecordPanel feed={{ rows: record, notice: undefined }} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect struck 01HF7YAT02' })
    );
    const pre = screen.getByLabelText('Record fields');
    expect(pre.textContent).toBe(
      JSON.stringify(
        {
          beat: 'struck',
          actor: 'ranger',
          amount: 6,
          attack: { roll: 14, total: 19 },
        },
        null,
        2
      )
    );
    expect(pre.textContent).toContain('\n  "attack": {\n    "roll": 14');
  });

  it('says when older beats aged out', () => {
    render(
      <RecordPanel
        feed={{ rows: record, notice: 'Older beats aged out of the record.' }}
      />
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Older beats aged out of the record.'
    );
  });
});
