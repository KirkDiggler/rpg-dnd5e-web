import { describe, expect, it } from 'vitest';
import {
  parseDungeonShellManifest,
  type DungeonShellCatalog,
} from './dungeonShellManifest';

const HASH = 'a'.repeat(64);

function artifact(file: string) {
  return {
    file,
    sha256: HASH,
    bounds: {
      min: [0, 0, 0],
      max: [2, 3, 4],
    },
  };
}

function validManifest() {
  return {
    schemaVersion: 1,
    profiles: {
      crypt: {
        floor: {
          diffuse: 'textures/floor-09-01-u6.png',
          sha256: HASH,
          worldUnitsPerRepeat: 6.25,
        },
        wall: {
          body: {
            ...artifact('env/crypt-wall-body.glb'),
            localSpanAxis: '+X',
            localFaceAxis: 'Z',
            twoSided: true,
          },
          base: artifact('env/crypt-wall-base.glb'),
          cap: artifact('env/crypt-wall-cap.glb'),
          doorSurround: artifact('env/crypt-door-surround.glb'),
        },
      },
    },
  };
}

function expectInvalid(value: unknown, reason?: RegExp) {
  const parsed = parseDungeonShellManifest(value);
  expect(parsed.ok).toBe(false);
  if (parsed.ok) throw new Error('expected invalid manifest');
  if (reason) expect(parsed.reason).toMatch(reason);
}

function mutate(change: (manifest: ReturnType<typeof validManifest>) => void) {
  const manifest = validManifest();
  change(manifest);
  return manifest;
}

describe('parseDungeonShellManifest', () => {
  it('parses the approved closed crypt profile shape', () => {
    const parsed = parseDungeonShellManifest(validManifest());

    expect(parsed).toEqual({ ok: true, catalog: expect.any(Object) });
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.catalog).toEqual({
      schemaVersion: 1,
      profiles: {
        crypt: {
          floor: {
            diffuse: 'textures/floor-09-01-u6.png',
            sha256: HASH,
            worldUnitsPerRepeat: 6.25,
          },
          wall: {
            body: {
              file: 'env/crypt-wall-body.glb',
              sha256: HASH,
              localSpanAxis: '+X',
              localFaceAxis: 'Z',
              twoSided: true,
              bounds: { min: [0, 0, 0], max: [2, 3, 4] },
            },
            base: {
              file: 'env/crypt-wall-base.glb',
              sha256: HASH,
              bounds: { min: [0, 0, 0], max: [2, 3, 4] },
            },
            cap: {
              file: 'env/crypt-wall-cap.glb',
              sha256: HASH,
              bounds: { min: [0, 0, 0], max: [2, 3, 4] },
            },
            doorSurround: {
              file: 'env/crypt-door-surround.glb',
              sha256: HASH,
              bounds: { min: [0, 0, 0], max: [2, 3, 4] },
            },
          },
        },
      },
    });
  });

  it('deep-freezes every accepted object and array', () => {
    const parsed = parseDungeonShellManifest(validManifest());
    if (!parsed.ok) throw new Error(parsed.reason);

    const catalog = parsed.catalog;
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.profiles)).toBe(true);
    expect(Object.isFrozen(catalog.profiles.crypt)).toBe(true);
    expect(Object.isFrozen(catalog.profiles.crypt.floor)).toBe(true);
    expect(Object.isFrozen(catalog.profiles.crypt.wall)).toBe(true);
    expect(Object.isFrozen(catalog.profiles.crypt.wall.body)).toBe(true);
    expect(Object.isFrozen(catalog.profiles.crypt.wall.body.bounds)).toBe(true);
    expect(Object.isFrozen(catalog.profiles.crypt.wall.body.bounds.min)).toBe(
      true
    );
  });

  it.each([
    [
      'root unknown key',
      mutate((manifest) => Reflect.set(manifest, 'extra', 1)),
    ],
    [
      'profile unknown key',
      mutate((manifest) => Reflect.set(manifest.profiles.crypt, 'extra', 1)),
    ],
    [
      'wall role unknown key',
      mutate((manifest) =>
        Reflect.set(manifest.profiles.crypt.wall, 'trim', {})
      ),
    ],
    [
      'artifact unknown key',
      mutate((manifest) =>
        Reflect.set(manifest.profiles.crypt.wall.base, 'extra', 1)
      ),
    ],
  ])('rejects %s', (_label, value) => {
    expectInvalid(value, /exact keys/);
  });

  it.each([
    ['schema version', mutate((manifest) => (manifest.schemaVersion = 2))],
    [
      'missing profile',
      mutate((manifest) => Reflect.deleteProperty(manifest.profiles, 'crypt')),
    ],
    [
      'missing wall role',
      mutate((manifest) =>
        Reflect.deleteProperty(manifest.profiles.crypt.wall, 'cap')
      ),
    ],
    [
      'false twoSided',
      mutate((manifest) =>
        Reflect.set(manifest.profiles.crypt.wall.body, 'twoSided', false)
      ),
    ],
    [
      'wrong span axis',
      mutate((manifest) =>
        Reflect.set(manifest.profiles.crypt.wall.body, 'localSpanAxis', '+Y')
      ),
    ],
    [
      'wrong face axis',
      mutate((manifest) =>
        Reflect.set(manifest.profiles.crypt.wall.body, 'localFaceAxis', 'X')
      ),
    ],
  ])('rejects %s', (_label, value) => {
    expectInvalid(value);
  });

  it.each([
    'textures/../secret.png',
    'textures/floor.png?x=1',
    'textures/floor.png#fragment',
    'textures/floor%2Epng',
    'textures/floor\\.png',
  ])('rejects unsafe texture path %s', (diffuse) => {
    expectInvalid(
      mutate((manifest) => (manifest.profiles.crypt.floor.diffuse = diffuse))
    );
  });

  it.each([
    'env/../secret.glb',
    'env/wall.glb?x=1',
    'env/wall.glb#fragment',
    'env/wall%2Eglb',
    'env/wall\\.glb',
  ])('rejects unsafe artifact path %s', (file) => {
    expectInvalid(
      mutate((manifest) => (manifest.profiles.crypt.wall.base.file = file))
    );
  });

  it.each([
    ['short hash', 'a'.repeat(63)],
    ['uppercase hash', 'A'.repeat(64)],
    ['non-hex hash', `${'a'.repeat(63)}g`],
  ])('rejects %s', (_label, sha256) => {
    expectInvalid(
      mutate((manifest) => (manifest.profiles.crypt.floor.sha256 = sha256))
    );
  });

  it.each([
    ['boolean repeat', true],
    ['zero repeat', 0],
    ['negative repeat', -1],
    ['NaN repeat', Number.NaN],
    ['infinite repeat', Number.POSITIVE_INFINITY],
  ])('rejects %s', (_label, value) => {
    expectInvalid(
      mutate((manifest) =>
        Reflect.set(manifest.profiles.crypt.floor, 'worldUnitsPerRepeat', value)
      )
    );
  });

  it.each([
    ['boolean bound', [true, 0, 0]],
    ['NaN bound', [Number.NaN, 0, 0]],
    ['infinite bound', [0, Number.POSITIVE_INFINITY, 0]],
    ['wrong bound shape', [0, 0]],
    ['inverted bound', [3, 0, 0]],
    ['degenerate bound', [2, 3, 4]],
  ])('rejects %s', (_label, min) => {
    expectInvalid(
      mutate((manifest) =>
        Reflect.set(manifest.profiles.crypt.wall.body.bounds, 'min', min)
      )
    );
  });

  it('rejects decorated or sparse vector arrays', () => {
    const decorated = [0, 0, 0] as number[] & { extra?: number };
    Reflect.set(decorated, 'extra', 1);
    expectInvalid(
      mutate((manifest) =>
        Reflect.set(manifest.profiles.crypt.wall.body.bounds, 'min', decorated)
      )
    );

    const sparse = [0, 0, 0] as number[];
    delete sparse[1];
    expectInvalid(
      mutate((manifest) =>
        Reflect.set(manifest.profiles.crypt.wall.body.bounds, 'min', sparse)
      )
    );
  });

  it('does not expose mutable input references', () => {
    const input = validManifest();
    const parsed = parseDungeonShellManifest(input);
    if (!parsed.ok) throw new Error(parsed.reason);

    input.profiles.crypt.floor.worldUnitsPerRepeat = 99;
    input.profiles.crypt.wall.body.bounds.min[0] = 99;
    expect(parsed.catalog.profiles.crypt.floor.worldUnitsPerRepeat).toBe(6.25);
    expect(parsed.catalog.profiles.crypt.wall.body.bounds.min[0]).toBe(0);
  });

  it('returns a controlled failure for hostile inspection values', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('hostile getter');
        },
      }
    );
    expect(parseDungeonShellManifest(hostile)).toEqual({
      ok: false,
      reason: 'manifest could not be safely inspected',
    });
  });

  it('exposes the accepted catalog as the declared immutable interface', () => {
    const parsed = parseDungeonShellManifest(validManifest());
    if (!parsed.ok) throw new Error(parsed.reason);
    const catalog: DungeonShellCatalog = parsed.catalog;
    expect(catalog.schemaVersion).toBe(1);
  });
});
