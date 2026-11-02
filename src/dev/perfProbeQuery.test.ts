import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPerfProbeQuery } from './perfProbeQuery';

describe('readPerfProbeQuery', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('opens under development and bench with ?perfProbe', () => {
    for (const mode of ['development', 'bench']) {
      vi.stubEnv('MODE', mode);
      expect(
        readPerfProbeQuery('?perfProbe&perfProbeMs=500&perfProbeLabel=keep')
      ).toEqual({ windowMs: 500, label: 'keep' });
    }
  });

  it('stays shut without the query flag', () => {
    vi.stubEnv('MODE', 'bench');
    expect(readPerfProbeQuery('?perfMarks')).toBeNull();
  });

  it('stays shut in production and test regardless of the query', () => {
    for (const mode of ['production', 'test']) {
      vi.stubEnv('MODE', mode);
      expect(readPerfProbeQuery('?perfProbe')).toBeNull();
    }
  });

  it('falls back to the probe default window for a malformed window', () => {
    vi.stubEnv('MODE', 'bench');
    expect(readPerfProbeQuery('?perfProbe&perfProbeMs=abc')).toEqual({
      windowMs: undefined,
      label: undefined,
    });
  });
});
