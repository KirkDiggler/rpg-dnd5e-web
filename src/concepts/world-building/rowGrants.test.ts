import { describe, expect, it } from 'vitest';
import {
  grantOf,
  otherGrantsOf,
  withApplyStatus,
  withGrant,
  type GrantingRow,
} from './rowGrants';
import { NO_SITE_NAMES, type SiteNames } from './siteNames';

const names: SiteNames = {
  ...NO_SITE_NAMES,
  records: ['rec'],
  statuses: [
    { id: 'welcomed', name: 'Welcomed' },
    { id: 'fed', name: 'Fed' },
  ],
};
const row = (extra: Record<string, unknown>): GrantingRow =>
  ({ say: 'In you go.', ...extra }) as unknown as GrantingRow;

describe('apply_status as a row grant', () => {
  it('is seen by grantOf (catches: the status hidden as Nothing)', () => {
    expect(
      grantOf(row({ apply_status: { status: 'fed', to: 'speaker' } }))
    ).toBe('apply_status');
  });

  it('is removed when another grant is chosen (catches: two grants written)', () => {
    const next = withGrant(
      row({ apply_status: { status: 'fed', to: 'speaker' } }),
      'tells',
      names
    ) as Record<string, unknown>;
    expect(next.apply_status).toBeUndefined();
    expect(next.tells).toBe('rec');
  });

  it('seeds the first status and speaker, and removes the others', () => {
    const next = withGrant(row({ tells: 'rec' }), 'apply_status', names);
    expect(next).toEqual({
      say: 'In you go.',
      apply_status: { status: 'welcomed', to: 'speaker' },
    });
  });

  it('seeds an empty status when the site has none', () => {
    const next = withGrant(row({}), 'apply_status', NO_SITE_NAMES);
    expect(next.apply_status).toEqual({ status: '', to: 'speaker' });
  });

  it('changes one field, keeping until, unknown keys and other row keys (catches: block rebuilt)', () => {
    const was = row({
      note: 'kept',
      apply_status: {
        status: 'fed',
        to: 'everyone',
        mystery: 1,
        until: { rounds: 2, odd: true },
      },
    });
    const next = withApplyStatus(was, { status: 'welcomed' }) as Record<
      string,
      unknown
    >;
    expect(next).toEqual({
      say: 'In you go.',
      note: 'kept',
      apply_status: {
        status: 'welcomed',
        to: 'everyone',
        mystery: 1,
        until: { rounds: 2, odd: true },
      },
    });
  });

  it('writes rounds into until, keeping what until holds', () => {
    const next = withApplyStatus(
      row({
        apply_status: { status: 'fed', to: 'speaker', until: { odd: true } },
      }),
      { rounds: 3 }
    );
    expect(next.apply_status?.until).toEqual({ odd: true, rounds: 3 });
  });

  it('rounds null removes until and keeps the rest', () => {
    const next = withApplyStatus(
      row({
        apply_status: {
          status: 'fed',
          to: 'speaker',
          mystery: 1,
          until: { rounds: 2 },
        },
      }),
      { rounds: null }
    );
    expect(next.apply_status).toEqual({
      status: 'fed',
      to: 'speaker',
      mystery: 1,
    });
  });

  it('lists the grants a row holds beyond the first', () => {
    expect(
      otherGrantsOf(
        row({ tells: 'rec', apply_status: { status: 'fed', to: 'speaker' } })
      )
    ).toEqual(['apply_status']);
    expect(otherGrantsOf(row({ tells: 'rec' }))).toEqual([]);
  });
});
