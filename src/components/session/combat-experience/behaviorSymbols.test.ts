import { describe, expect, it } from 'vitest';
import captured from '../fixtures/machine-inspection-capture.jsonl?raw';
import investigationCapture from '../fixtures/machine-investigation-capture.jsonl?raw';
import { recordContextRows } from '../recordBuffer';
import { parseRecordCapture } from '../recordCapture';
import type { RecordRow } from '../recordFeed';
import {
  behaviorSymbolsOf,
  readBehaviorTrace,
  readGuardTrace,
} from './behaviorSymbols';

function fixture() {
  const feed = parseRecordCapture(captured).feed;
  const rows = recordContextRows(feed);
  return {
    rows,
    symbols: behaviorSymbolsOf(rows),
    records: new Map(rows.map((row) => [row.id, row])),
  };
}

describe('behavior symbols and actual outcomes', () => {
  it('loads the exact two bound configurations from a real captured run', () => {
    const { symbols } = fixture();
    expect(symbols.configurations.size).toBe(2);
    expect(symbols.problems.size).toBe(0);
    for (const config of symbols.configurations.values()) {
      expect(config.instances.map((i) => i.id)).toEqual([
        'investigate',
        'duty',
      ]);
      expect(config.instances[0].recipe.initial).toBe('idle');
      expect(config.instances[1].recipe.initial).toBe('item/0/walk');
    }
  });

  it('pairs the decision with its actual picker record without reevaluating alternatives', () => {
    const { rows, symbols, records } = fixture();
    const row = rows.find((r) => r.id === '01M6YJ84YS2V3FFGDK17EDYF75')!;
    const reading = readBehaviorTrace({ row, symbols, records });
    expect(reading?.kind).toBe('decision');
    expect(reading?.warnings).toEqual([]);
    expect(reading?.roles.map((r) => r.id)).toEqual(['investigate', 'duty']);
    expect(reading?.roles[0].status).toContain('observed');
    expect(reading?.roles[0].transitions[0].guard.status).toBe('not evaluated');
    expect(reading?.roles[1].status).toContain('selected');
    expect(reading?.roles[1].transitions[0].guard.status).toBe('matched');
    expect(reading?.pick?.beat).toBe('answered');
    expect(reading?.pick?.id).toBe(row.fields?.pick_record);
  });

  it('shows the actual investigation winner and retained patrol from the live fixture', () => {
    const rows = recordContextRows(
      parseRecordCapture(investigationCapture).feed
    );
    const symbols = behaviorSymbolsOf(rows);
    const records = new Map(rows.map((row) => [row.id, row]));
    const row = records.get('01M6YKP9ZX7TMK0QDABXXJ0WGZ')!;
    const reading = readBehaviorTrace({ row, symbols, records });
    expect(reading?.roles[0].status).toContain('selected');
    expect(reading?.roles[1].status).toContain('deferred');
    expect(reading?.roles[1].before).toBe('item/0/walk');
    expect(reading?.roles[1].after).toBe('item/0/walk');
    expect(reading?.roles[0].transitions[0].guard.status).toBe('rejected');
    expect(reading?.roles[0].transitions[0].guard.observed).toBe('0');
  });

  it('keeps selected, partial and completed execution different', () => {
    const { rows, symbols, records } = fixture();
    const readings = rows
      .filter((r) => r.beat === 'behavior_work')
      .map((row) => readBehaviorTrace({ row, symbols, records }));
    expect(readings.map((r) => r?.work?.status)).toEqual([
      'selected',
      'completed',
      'selected',
      'partial',
    ]);
    expect(readings.at(-1)?.work?.decisionRecord).toBe(
      '01M6YJ84YS2V3FFGDK17EDYF75'
    );
  });

  it('declines precision-lost live symbols and decisions while the wire decision is open', () => {
    const { rows, symbols, records } = fixture();
    const symbol = rows.find((row) => row.beat === 'behavior_config')!;
    expect(
      behaviorSymbolsOf([{ ...symbol, precisionUnavailable: true }])
        .configurations.size
    ).toBe(0);
    const row = rows.find((row) => row.beat === 'behavior_decision')!;
    const reading = readBehaviorTrace({
      row: { ...row, precisionUnavailable: true },
      symbols,
      records,
    });
    expect(reading?.warnings.join(' ')).toMatch(/precision/i);
    expect(reading?.roles).toEqual([]);
  });

  it('never substitutes a current definition when symbols are missing', () => {
    const { rows, records } = fixture();
    const row = rows.find((r) => r.beat === 'behavior_decision')!;
    const reading = readBehaviorTrace({
      row,
      symbols: behaviorSymbolsOf([]),
      records,
    });
    expect(reading?.warnings.join(' ')).toMatch(/configuration.*unavailable/i);
    expect(reading?.configuration).toBeUndefined();
  });

  it('refuses two meanings for one configuration ID and an unknown schema', () => {
    const { rows } = fixture();
    const symbol = rows.find((r) => r.beat === 'behavior_config')!;
    const changed = structuredClone(symbol) as RecordRow;
    (changed.fields!.configuration as { BodyInstance: string }).BodyInstance =
      'changed';
    const bad = behaviorSymbolsOf([symbol, { ...changed, id: 'later' }]);
    expect(bad.problems.get(String(symbol.fields?.config))).toMatch(
      /conflicting/i
    );
    expect(bad.configurations.has(String(symbol.fields?.config))).toBe(false);
    const future = behaviorSymbolsOf([
      { ...symbol, fields: { ...symbol.fields, schema: 2 } },
    ]);
    expect(future.problems.get(String(symbol.fields?.config))).toMatch(
      /schema/i
    );
  });

  it('refuses malformed guard symbols rather than inventing a missing operand', () => {
    const { rows } = fixture();
    const original = rows.find((row) => row.beat === 'behavior_config')!;
    const row = structuredClone(original);
    const config = row.fields!.configuration as {
      Instances: {
        Instance: {
          recipe: {
            states: Record<string, { transitions: { when?: unknown }[] }>;
          };
        };
      }[];
    };
    config.Instances[0].Instance.recipe.states.idle.transitions[0].when = {
      fact: { name: 'heard.kind', op: 'eq' },
    };
    const symbols = behaviorSymbolsOf([row]);
    expect(symbols.problems.get(String(row.fields?.config))).toMatch(/guard/i);
    expect(symbols.configurations.size).toBe(0);
  });

  it('shows an actual unknown verdict rather than treating it as a false guard', () => {
    const symbol = { fact: { name: 'known', op: 'eq', value: true } };
    const trace = {
      evaluated: true,
      verdict: 'depends',
      reason: 'known',
      read: true,
      known: false,
      scalar: false,
      value: null,
      children: [],
    };
    expect(readGuardTrace({ symbol, trace }).status).toBe('unknown');
    expect(
      readGuardTrace({
        symbol,
        trace: {
          ...trace,
          verdict: 'does not apply',
          known: true,
          scalar: true,
          value: false,
        },
      }).status
    ).toBe('rejected');
    expect(readGuardTrace({ symbol, trace: { evaluated: false } }).status).toBe(
      'not evaluated'
    );
  });
});
