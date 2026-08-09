import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const GENERATED_SHA = 'a6648cecf193894231bf55df1fc28b3eb42cf32e';

describe('immutable TypeScript PlacementOffset contract', () => {
  it('pins generated tag v0.1.123 to the API-compatible generated commit', () => {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(resolve('package-lock.json'), 'utf8'));
    expect(pkg.dependencies['@kirkdiggler/rpg-api-protos']).toBe(
      'github:KirkDiggler/rpg-api-protos#v0.1.123'
    );
    expect(
      lock.packages[
        'node_modules/@kirkdiggler/rpg-api-protos'
      ].resolved.endsWith(`#${GENERATED_SHA}`)
    ).toBe(true);
  });

  it('contains PlacementOffset on authoring and runtime generated TS surfaces', () => {
    const root = resolve(
      'node_modules/@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api'
    );
    const common = readFileSync(resolve(root, 'v1alpha1/common_pb.ts'), 'utf8');
    const authoring = readFileSync(
      resolve(root, 'authoring/v1alpha1/service_pb.ts'),
      'utf8'
    );
    const runtime = readFileSync(
      resolve(root, 'v1alpha2/encounter/types_pb.ts'),
      'utf8'
    );
    expect(common).toContain('export type PlacementOffset');
    expect(authoring).toContain('offset?: PlacementOffset | undefined');
    expect(runtime).toContain('offset?: PlacementOffset | undefined');
  });
});
