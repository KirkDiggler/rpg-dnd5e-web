import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import captured from '../fixtures/machine-investigation-capture.jsonl?raw';
import { recordContextRows } from '../recordBuffer';
import { parseRecordCapture } from '../recordCapture';
import { behaviorSymbolsOf } from './behaviorSymbols';
import { BehaviorTrace } from './BehaviorTrace';
import { symbolsOf } from './recordSymbols';

afterEach(cleanup);

function props(id: string) {
  const rows = recordContextRows(parseRecordCapture(captured).feed);
  const records = new Map(rows.map((row) => [row.id, row]));
  return {
    row: records.get(id)!,
    symbols: behaviorSymbolsOf(rows),
    records,
    tableSymbols: symbolsOf(rows),
  };
}

describe('BehaviorTrace', () => {
  it('shows actual competing roles, observed guard values and picker evidence', () => {
    render(<BehaviorTrace {...props('01M6YKP9ZX7TMK0QDABXXJ0WGZ')} />);
    expect(screen.getByRole('list', { name: 'Roles considered' })).toBeTruthy();
    expect(screen.getByText('requested; not selected (deferred)')).toBeTruthy();
    expect(screen.getByText('selected; committed')).toBeTruthy();
    expect(screen.getByText(/elapsed rounds gte 2/)).toBeTruthy();
    expect(screen.getByText('observed 0')).toBeTruthy();
    expect(screen.getByLabelText('Picker evidence')).toBeTruthy();
    expect(screen.getByText('Original bound configuration')).toBeTruthy();
  });

  it('never labels partial execution as completed', () => {
    render(<BehaviorTrace {...props('01M6YJ84YT1B8EXF8T2N11FQ2B')} />);
    expect(
      screen.getByRole('heading', { name: 'west · execution partial' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: /execution completed/ })
    ).toBeNull();
    expect(screen.getByText(/goal_not_reached/)).toBeTruthy();
  });

  it('reports unavailable symbols instead of guessing a configuration', () => {
    const input = props('01M6YKP9ZX7TMK0QDABXXJ0WGZ');
    render(<BehaviorTrace {...input} symbols={behaviorSymbolsOf([])} />);
    expect(screen.getByRole('status').textContent).toMatch(
      /Configuration.*unavailable/
    );
    expect(screen.queryByText('Original bound configuration')).toBeNull();
  });
});
