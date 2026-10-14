import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { heaviestFirst } from './answerTableShape';
import { useRowKeys } from './useRowKeys';

describe('useRowKeys', () => {
  it('an edited row keeps its key as the sort moves it to the top', () => {
    type Row = { say: string; weight?: number };
    const a: Row = { say: 'a' };
    const b: Row = { say: 'b' };
    const c: Row = { say: 'c' };
    const { result, rerender } = renderHook(({ rows }) => useRowKeys(rows), {
      initialProps: { rows: [a, b, c] as object[] },
    });
    const [ka, kb, kc] = result.current;
    const heavier = { ...c, weight: 5 };
    rerender({ rows: heaviestFirst([a, b, heavier]) });
    expect(result.current).toEqual([kc, ka, kb]);
  });

  it('a removed row frees nothing for an untouched list, and a new row gets a new key', () => {
    const a = { say: 'a' };
    const b = { say: 'b' };
    const { result, rerender } = renderHook(({ rows }) => useRowKeys(rows), {
      initialProps: { rows: [a, b] as object[] },
    });
    const [ka] = result.current;
    rerender({ rows: [a] });
    expect(result.current).toEqual([ka]);
    rerender({ rows: [a, { say: 'c' }] });
    expect(result.current[0]).toBe(ka);
    expect(new Set(result.current).size).toBe(2);
  });
});
