import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import captured from '../fixtures/machine-investigation-capture.jsonl?raw';
import { recordContextRows } from '../recordBuffer';
import { parseRecordCapture } from '../recordCapture';
import { RecordPanel } from './RecordPanel';

afterEach(cleanup);

describe('RecordPanel captured inspection', () => {
  it('opens captured evidence separately from the live feed and can return to live', async () => {
    render(<RecordPanel feed={{ rows: [], notice: undefined }} />);
    const file = new File([captured], 'run.jsonl', {
      type: 'application/x-ndjson',
    });
    Object.defineProperty(file, 'text', { value: async () => captured });
    fireEvent.change(screen.getByLabelText('Open record capture'), {
      target: { files: [file] },
    });
    expect(await screen.findByText(/Captured run 35327bdc/)).toBeTruthy();
    expect(screen.getByText(/earlier history/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Return to live records' })
    );
    expect(screen.getByText('No record beats received.')).toBeTruthy();
  });

  it('uses retained symbols and recorded backlinks when their rows are outside the visible ring', () => {
    const parsed = parseRecordCapture(captured).feed;
    const context = recordContextRows(parsed);
    const decision = context.find(
      (row) => row.id === '01M6YKP9ZX7TMK0QDABXXJ0WGZ'
    )!;
    const pick = context.find(
      (row) => row.id === decision.fields?.pick_record
    )!;
    render(
      <RecordPanel
        feed={{
          rows: [decision],
          symbols: parsed.symbols,
          related: [pick],
          notice: undefined,
        }}
      />
    );
    fireEvent.change(screen.getByLabelText('Filter by beat'), {
      target: { value: 'behavior_decision' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: `Inspect behavior_decision ${decision.id}`,
      })
    );
    expect(screen.getByText('Original bound configuration')).toBeTruthy();
    expect(screen.getByText('requested; not selected (deferred)')).toBeTruthy();
    expect(screen.getByLabelText('Picker evidence')).toBeTruthy();
  });

  it('reports malformed captures without replacing the live evidence', async () => {
    render(<RecordPanel feed={{ rows: [], notice: 'Live notice' }} />);
    const file = new File(['broken'], 'bad.jsonl');
    Object.defineProperty(file, 'text', { value: async () => 'broken' });
    fireEvent.change(screen.getByLabelText('Open record capture'), {
      target: { files: [file] },
    });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Live notice')).toBeTruthy();
    expect(screen.queryByText(/Captured run/)).toBeNull();
  });
});
