import { create } from '@bufbuild/protobuf';
import { RecordEventSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_pb';
import { describe, expect, it } from 'vitest';
import captured from './fixtures/machine-inspection-capture.jsonl?raw';
import {
  formatRecordJSON,
  parseRecordCapture,
  parseRecordJSON,
} from './recordCapture';
import { toRecordRow } from './recordFeed';

const header = JSON.stringify({
  schema: 1,
  kind: 'capture',
  capture: 'test',
  logged_at: '2026-11-08T00:00:00Z',
  status: 'started',
  history_complete: false,
});

function event(
  id: string,
  fields: Record<string, unknown> = {},
  session = 'run'
) {
  return {
    schema: 1,
    kind: 'record',
    capture: 'test',
    logged_at: '2026-11-08T00:00:00Z',
    session,
    id,
    act: '',
    at: 0,
    beat: 'test',
    fields,
  };
}

describe('recordCapture', () => {
  it('gives the same exact values to live and captured readers', () => {
    const raw = '{"value":9007199254740993,"zero":0,"flag":false,"label":""}';
    const live = toRecordRow(
      create(RecordEventSchema, {
        id: 'A1',
        act: '',
        at: 3n,
        beat: 'test',
        fieldsJson: new TextEncoder().encode(raw),
        fields: { value: 9007199254740992 },
      })
    );
    const capture = parseRecordCapture(
      header +
        '\n' +
        `{"schema":1,"kind":"record","capture":"test","session":"run","id":"A1","act":"","at":3,"beat":"test","fields":${raw}}`
    );
    expect(live).toEqual(capture.feed.rows[0]);
    expect(live.fields?.value).toBe(9007199254740993n);
  });
  it('reads actual API output, including configuration symbols and work correlation', () => {
    const result = parseRecordCapture(captured);
    expect(result.session).toBe('35327bdc-61a0-452a-b3b3-c1953e0cb428');
    expect(result.count).toBe(40);
    expect(result.feed.rows).toHaveLength(40);
    expect(
      result.feed.symbols?.filter((r) => r.beat === 'behavior_config')
    ).toHaveLength(2);
    expect(
      result.feed.rows.filter((r) => r.beat.startsWith('behavior_'))
    ).toHaveLength(9);
    expect(result.feed.notice).toContain('earlier history');
    const partial = result.feed.rows.find(
      (r) => r.fields?.status === 'partial'
    );
    expect(partial?.fields?.decision_record).toBe('01M6YJ84YS2V3FFGDK17EDYF75');
  });

  it('preserves wide integers and supplied zero, false and empty values', () => {
    const raw =
      '{"schema":1,"kind":"record","capture":"test","logged_at":"2026-11-08T00:00:00Z","session":"run","id":"A1","act":"","at":9007199254740993,"beat":"test","fields":{"n":9007199254740993,"zero":0,"flag":false,"label":""}}';
    const result = parseRecordCapture(header + '\n' + raw);
    expect(result.feed.rows[0].at).toBe(9007199254740993n);
    expect(result.feed.rows[0].fields).toEqual({
      n: 9007199254740993n,
      zero: 0,
      flag: false,
      label: '',
    });
    const displayed = formatRecordJSON(result.feed.rows[0].fields);
    expect(displayed).toContain('9007199254740993');
    expect(parseRecordJSON(displayed)).toEqual(result.feed.rows[0].fields);
  });

  it('rejects unsupported versions, malformed JSON and mixed sessions', () => {
    expect(() =>
      parseRecordCapture(JSON.stringify({ ...event('A1'), schema: 2 }))
    ).toThrow(/schema/i);
    expect(() => parseRecordCapture('{not JSON}')).toThrow(/line 1/i);
    expect(() =>
      parseRecordCapture(
        [
          header,
          JSON.stringify(event('A1')),
          JSON.stringify(event('A2', {}, 'other')),
        ].join('\n')
      )
    ).toThrow(/session/i);
  });

  it('keeps incompleteness explicit rather than treating a drain as full history', () => {
    const gap = JSON.stringify({
      schema: 1,
      kind: 'capture',
      capture: 'test',
      logged_at: '2026-11-08T00:00:00Z',
      status: 'incomplete',
      history_complete: false,
      reason: 'queue_full',
    });
    const result = parseRecordCapture(
      [header, JSON.stringify(event('A1')), gap].join('\n')
    );
    expect(result.feed.notice).toContain('incomplete');
    expect(result.feed.notice).toContain('queue_full');
    const drained = parseRecordCapture(
      [
        header,
        JSON.stringify(event('A1')),
        gap.replace('incomplete', 'drained'),
      ].join('\n')
    );
    expect(drained.feed.notice).toContain('earlier history');
  });

  it('deduplicates identical IDs but refuses conflicting evidence', () => {
    const one = JSON.stringify(event('A1', { value: 1 }));
    expect(parseRecordCapture([header, one, one].join('\n')).count).toBe(1);
    expect(() =>
      parseRecordCapture(
        [header, one, JSON.stringify(event('A1', { value: 2 }))].join('\n')
      )
    ).toThrow(/conflicting/i);
  });

  it('retains symbols independently of a capped visible row window', () => {
    const original = captured
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const symbol = original.find((line) => line.beat === 'behavior_config');
    const many = Array.from({ length: 700 }, (_, i) =>
      JSON.stringify(
        event(`Z${String(i).padStart(4, '0')}`, {}, symbol.session)
      )
    );
    const result = parseRecordCapture(
      [JSON.stringify(original[0]), JSON.stringify(symbol), ...many].join('\n')
    );
    expect(result.feed.rows).toHaveLength(500);
    expect(result.feed.rows.some((row) => row.id === symbol.id)).toBe(false);
    expect(result.feed.symbols?.some((row) => row.id === symbol.id)).toBe(true);
  });
});
