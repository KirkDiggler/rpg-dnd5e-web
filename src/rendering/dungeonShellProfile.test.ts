import { describe, expect, it } from 'vitest';
import type { DungeonShellProfile } from './dungeonShellManifest';
import {
  resolveDungeonShellProfile,
  type DungeonShellSelection,
} from './dungeonShellProfile';
import type { DungeonShellCatalogSnapshot } from './dungeonShellProvider';

const HASH = 'a'.repeat(64);

function artifact(file: `env/${string}.glb`) {
  return {
    file,
    sha256: HASH,
    bounds: {
      min: [0, 0, 0] as const,
      max: [1, 1, 1] as const,
    },
  } as const;
}

const cryptProfile: DungeonShellProfile = Object.freeze({
  floor: Object.freeze({
    diffuse: 'textures/crypt-floor.png',
    sha256: HASH,
    worldUnitsPerRepeat: 6.25,
  }),
  wall: Object.freeze({
    body: Object.freeze({
      ...artifact('env/crypt-wall-body.glb'),
      localSpanAxis: '+X' as const,
      localFaceAxis: 'Z' as const,
      twoSided: true as const,
    }),
    base: artifact('env/crypt-wall-base.glb'),
    cap: artifact('env/crypt-wall-cap.glb'),
    doorSurround: artifact('env/crypt-door-surround.glb'),
  }),
});

function readyCatalog(): DungeonShellCatalogSnapshot {
  return Object.freeze({
    status: 'ready',
    catalog: Object.freeze({
      schemaVersion: 1 as const,
      profiles: Object.freeze({ crypt: cryptProfile }),
    }),
  });
}

describe('resolveDungeonShellProfile', () => {
  it('returns the frozen crypt profile for uniform known archetypes', () => {
    const snapshot = readyCatalog();
    const selection = resolveDungeonShellProfile(['crypt', 'crypt'], snapshot);

    expect(selection).toEqual({
      kind: 'profile',
      key: 'crypt',
      profile: cryptProfile,
    });
    expect(selection.kind).toBe('profile');
    if (selection.kind === 'profile') {
      expect(selection.profile).toBe(cryptProfile);
      expect(Object.isFrozen(selection.profile)).toBe(true);
    }
  });

  it('treats no regions as no-regions and empty archetypes as unknown', () => {
    const snapshot = readyCatalog();

    expect(resolveDungeonShellProfile([], snapshot)).toEqual({
      kind: 'legacy',
      reason: 'no-regions',
    });
    expect(resolveDungeonShellProfile(['', '   '], snapshot)).toEqual({
      kind: 'legacy',
      reason: 'unknown-archetype',
    });
  });

  it('reports a single unknown archetype without selecting a profile', () => {
    expect(resolveDungeonShellProfile([' cave '], readyCatalog())).toEqual({
      kind: 'legacy',
      reason: 'unknown-archetype',
    });
  });

  it.each([
    ['crypt', ''],
    ['', 'crypt'],
    ['crypt', '   '],
    ['   ', 'crypt'],
  ])(
    'reports valid plus empty or whitespace archetypes regardless of order: %s',
    (...archetypes) => {
      expect(resolveDungeonShellProfile(archetypes, readyCatalog())).toEqual({
        kind: 'legacy',
        reason: 'unknown-archetype',
      });
    }
  );

  it.each([
    ['crypt', 'cave', 'crypt'],
    ['cave', 'crypt', 'cave'],
  ])(
    'reports mixed archetypes regardless of input order: %s',
    (...archetypes) => {
      expect(resolveDungeonShellProfile(archetypes, readyCatalog())).toEqual({
        kind: 'legacy',
        reason: 'mixed-archetypes',
      });
    }
  );

  it.each(['idle', 'loading'] as const)(
    '%s snapshots remain loading',
    (status) => {
      expect(resolveDungeonShellProfile(['crypt'], { status })).toEqual({
        kind: 'loading',
      });
    }
  );

  it.each(['manifest-unavailable', 'invalid-profile'] as const)(
    'maps failed %s snapshots to the exact fallback reason',
    (failureKind) => {
      expect(
        resolveDungeonShellProfile(['crypt'], {
          status: 'failed',
          failureKind,
          failureReason: 'not used for selection',
        })
      ).toEqual({ kind: 'legacy', reason: failureKind });
    }
  );

  it('keeps the public selection union explicit', () => {
    const selection: DungeonShellSelection = resolveDungeonShellProfile(
      ['crypt'],
      readyCatalog()
    );
    expect(selection.kind).toBe('profile');
  });
});
