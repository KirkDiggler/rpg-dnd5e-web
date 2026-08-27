import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const CONCEPT = join(ROOT, 'src/concepts/attack-die-3d');
const SHARED_DICE = join(ROOT, 'src/components/ui/dice');

function source(path: string) {
  return readFileSync(path, 'utf8');
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? filesUnder(path)
      : /\.[cm]?[jt]sx?$/.test(entry.name)
        ? [path]
        : [];
  });
}

describe('shared table dice concept boundary', () => {
  it('keeps fixture truth and scheduling downstream of shared dice value types', () => {
    for (const name of [
      'sharedTableDiceFixtures.ts',
      'sharedTableDiceDelivery.ts',
      'sharedTableDiceState.ts',
    ]) {
      const contents = source(join(CONCEPT, name));
      expect(contents).toContain('../../components/ui/dice/');
      expect(contents).not.toMatch(
        /components\/session|src\/api|generated|@bufbuild|@connectrpc|grpc|fetch\s*\(/
      );
    }

    const inverted = filesUnder(SHARED_DICE).filter((path) =>
      /concepts\/attack-die-3d|sharedTableDice/.test(source(path))
    );
    expect(inverted.map((path) => relative(ROOT, path))).toEqual([]);
  });

  it('keeps every new concept module free of session, API, generated proto, and network-client imports', () => {
    const taskEightModules = [
      'SharedTableDiceStage.tsx',
      'sharedTableDiceEvidence.ts',
    ];
    for (const name of taskEightModules) {
      const contents = source(join(CONCEPT, name));
      expect(contents).not.toMatch(
        /(?:from|import\s*)\s*['"][^'"]*(?:components\/session|\/api\/|generated|proto|grpc|connect-query|network)[^'"]*['"]/
      );
      expect(contents).not.toMatch(
        /\bfetch\s*\(|\bWebSocket\b|EventSource\s*\(/
      );
    }
  });

  it('mounts exactly two literal DiceTrayPresentation roll-group boundaries', () => {
    const stage = source(join(CONCEPT, 'SharedTableDiceStage.tsx'));
    expect(stage.match(/<DiceTrayPresentation\b/g)).toHaveLength(2);
    expect(stage.match(/mode="roll-group"/g)).toHaveLength(2);
  });

  it('scopes every Task 8 selector under the shared table stage without replacing the global grab target', () => {
    const css = source(join(ROOT, 'public/themes/base.css'));
    const marker = '/* Shared table dice feel lab (concept only). */';
    const start = css.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start).replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...block.matchAll(/([^{}]+)\{/g)]
      .map((match) => match[1].trim())
      .filter((selector) => !selector.startsWith('@'))
      .flatMap((selector) => selector.split(',').map((part) => part.trim()));
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors)
      expect(selector.startsWith('.shared-table-dice-stage')).toBe(true);

    expect(
      css.match(/^\.dice-tray-3d-renderer > \.dice-tray-3d-grab-target \{$/gm)
    ).toHaveLength(1);
  });
});
