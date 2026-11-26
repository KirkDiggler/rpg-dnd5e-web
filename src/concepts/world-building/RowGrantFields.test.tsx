import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RowGrantFields } from './RowGrantFields';
import type { GrantingRow } from './rowGrants';
import { NO_SITE_NAMES, SiteNamesContext, type SiteNames } from './siteNames';

afterEach(cleanup);

const names: SiteNames = {
  ...NO_SITE_NAMES,
  records: ['rec'],
  statuses: [
    { id: 'welcomed', name: 'Welcomed' },
    { id: 'fed', name: 'Fed' },
  ],
};

function show(
  row: Record<string, unknown>,
  opts: { isProp?: boolean; names?: SiteNames } = {}
) {
  const onCommit = vi.fn();
  render(
    <SiteNamesContext.Provider value={opts.names ?? names}>
      <RowGrantFields
        label="line 1 success"
        row={{ say: 'In you go.', ...row } as unknown as GrantingRow}
        isProp={opts.isProp ?? false}
        namesConversation={false}
        onCommit={onCommit}
      />
    </SiteNamesContext.Provider>
  );
  return onCommit;
}
const field = (name: string) =>
  screen.getByLabelText(`${name} for line 1 success entry`) as
    | HTMLSelectElement
    | HTMLInputElement;
const optionsOf = (select: HTMLElement) =>
  Array.from((select as HTMLSelectElement).options).map((o) => o.value);

describe('RowGrantFields: a status effect', () => {
  it('shows a row that gives a status, not Nothing (catches: reads Nothing)', () => {
    show({ apply_status: { status: 'welcomed', to: 'speaker' } });
    const grants = field('Grants') as HTMLSelectElement;
    expect(grants.value).toBe('apply_status');
    expect(grants.selectedOptions[0]!.textContent).toBe(
      'Gives a status effect'
    );
    expect(field('Status').value).toBe('welcomed');
    expect(
      (field('Status') as HTMLSelectElement).selectedOptions[0]!.textContent
    ).toBe('Welcomed (welcomed)');
    expect(field('To').value).toBe('speaker');
  });

  it('choosing another status commits a row with only that changed', () => {
    const onCommit = show({
      apply_status: { status: 'welcomed', to: 'speaker' },
    });
    fireEvent.change(field('Status'), { target: { value: 'fed' } });
    expect(onCommit).toHaveBeenCalledWith({
      say: 'In you go.',
      apply_status: { status: 'fed', to: 'speaker' },
    });
  });

  it('shows a written to as written and keeps it on a change of status', () => {
    const onCommit = show({
      apply_status: { status: 'welcomed', to: 'everyone' },
    });
    expect(field('To').value).toBe('everyone');
    fireEvent.change(field('Status'), { target: { value: 'fed' } });
    expect(onCommit.mock.calls[0]![0].apply_status).toEqual({
      status: 'fed',
      to: 'everyone',
    });
  });

  it('shows a status id the site lacks as written', () => {
    show({ apply_status: { status: 'ghost', to: 'speaker' } });
    expect(field('Status').value).toBe('ghost');
    expect(optionsOf(field('Status'))).toContain('ghost');
  });

  it('offers only the speaker on a prop, and the three on a creature', () => {
    show({ apply_status: { status: 'fed', to: 'speaker' } }, { isProp: true });
    expect(optionsOf(field('To'))).toEqual(['speaker']);
    cleanup();
    show({ apply_status: { status: 'fed', to: 'speaker' } });
    expect(optionsOf(field('To'))).toEqual([
      'speaker',
      'party_in_sight',
      'spoken_to',
    ]);
  });

  it('offers the grant on a prop too', () => {
    show({}, { isProp: true });
    expect(optionsOf(field('Grants'))).toContain('apply_status');
  });

  it('shows the short form as one read-only line and commits nothing', () => {
    const onCommit = show({ apply_status: 'welcomed' });
    expect((field('Grants') as HTMLSelectElement).value).toBe('apply_status');
    expect(screen.getByText('"welcomed"')).toBeTruthy();
    expect(screen.queryByLabelText(/^Status for/)).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('says a row holding two grants also has the other', () => {
    show({ tells: 'rec', apply_status: { status: 'fed', to: 'speaker' } });
    expect(
      screen.getByText(
        /This row also has: apply_status\. The engine allows one\./
      )
    ).toBeTruthy();
  });

  it('writes and clears rounds', () => {
    const onCommit = show({
      apply_status: { status: 'fed', to: 'speaker', keep: 1 },
    });
    fireEvent.change(field('Rounds'), { target: { value: '3' } });
    expect(onCommit.mock.calls[0]![0].apply_status).toEqual({
      status: 'fed',
      to: 'speaker',
      keep: 1,
      until: { rounds: 3 },
    });
    cleanup();
    const again = show({
      apply_status: { status: 'fed', to: 'speaker', until: { rounds: 3 } },
    });
    fireEvent.change(field('Rounds'), { target: { value: '' } });
    expect(again.mock.calls[0]![0].apply_status).toEqual({
      status: 'fed',
      to: 'speaker',
    });
  });

  it('lists the keys it does not know', () => {
    show({
      apply_status: {
        status: 'fed',
        to: 'speaker',
        mystery: 1,
        until: { rounds: 1, odd: 2 },
      },
    });
    expect(screen.getByText('also written: mystery, until.odd')).toBeTruthy();
  });

  it('says so when the site has no statuses', () => {
    const onCommit = show(
      { apply_status: { status: '', to: 'speaker' } },
      { names: NO_SITE_NAMES }
    );
    expect(
      screen.getByText('This site has no status effects yet.')
    ).toBeTruthy();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('choosing it from Nothing seeds the first status', () => {
    const onCommit = show({});
    fireEvent.change(field('Grants'), { target: { value: 'apply_status' } });
    expect(onCommit).toHaveBeenCalledWith({
      say: 'In you go.',
      apply_status: { status: 'welcomed', to: 'speaker' },
    });
  });

  it('R4 shows a non-mapping until as written, with no Rounds field, and keeps it', () => {
    const onCommit = show({
      apply_status: { status: 'welcomed', to: 'speaker', until: 3 },
    });
    expect(screen.queryByLabelText(/^Rounds for/)).toBeNull();
    expect(screen.getByText('3')).toBeTruthy();
    fireEvent.change(field('Status'), { target: { value: 'fed' } });
    expect(onCommit.mock.calls[0]![0].apply_status.until).toBe(3);
  });

  it('R5 draws one option per distinct value and no blank label when to is written', () => {
    show({ apply_status: { status: 'fed', to: 'everyone' } });
    const labels = Array.from((field('To') as HTMLSelectElement).options).map(
      (o) => o.textContent
    );
    expect(labels).toEqual([
      'The speaker',
      'The speaker’s party in sight',
      'The one spoken to',
      'everyone',
    ]);
    cleanup();
    show({ apply_status: { status: 'fed' } });
    const values = optionsOf(field('To'));
    expect(values.filter((v) => v === '')).toHaveLength(1);
    expect(new Set(values).size).toBe(values.length);
  });

  it('R3 a status change with no to written writes no to', () => {
    const onCommit = show({ apply_status: { status: 'welcomed' } });
    fireEvent.change(field('Status'), { target: { value: 'fed' } });
    expect(onCommit.mock.calls[0]![0].apply_status).toEqual({ status: 'fed' });
  });
});
