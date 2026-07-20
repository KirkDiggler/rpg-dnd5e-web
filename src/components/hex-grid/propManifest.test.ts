import { describe, expect, it } from 'vitest';
import {
  EXPECTED_PROP_KEYS,
  PROP_KEYS,
  resolvePropModelUrl,
  resolvePropVariant,
} from './propManifest';

describe('EXPECTED_PROP_KEYS guard (rpg-dnd5e-web#528, charter #523)', () => {
  // The charter's own guard-test ask: every key in the agreed list must
  // resolve in the synced manifest. EXPECTED_PROP_KEYS is hand-authored
  // independently of PROP_KEYS (see propManifest.ts's comment on why) —
  // this loop is what actually catches drift between "what platform
  // agreed to send" and "what this file's manifest mirror contains".
  // Platform extends the list by appending to EXPECTED_PROP_KEYS; this
  // test picks up new entries with no other change required.
  for (const key of EXPECTED_PROP_KEYS) {
    it(`"${key}" resolves to a variant with a loadable file`, () => {
      const variant = resolvePropVariant(key);
      expect(variant).toBeDefined();
      expect(variant?.file).toMatch(/^props\/.+\.glb$/);
    });

    it(`"${key}" resolves a model url via resolvePropModelUrl`, () => {
      expect(resolvePropModelUrl(key)).toBe(
        `/models/synty/${resolvePropVariant(key)?.file}`
      );
    });
  }

  it('has exactly 17 keys today, matching the #523 comment-thread count', () => {
    expect(EXPECTED_PROP_KEYS.length).toBe(17);
  });

  it('every EXPECTED_PROP_KEYS entry follows the dnd5e:props:<name> convention', () => {
    for (const key of EXPECTED_PROP_KEYS) {
      expect(key).toMatch(/^dnd5e:props:[a-z-]+$/);
    }
  });
});

describe('resolvePropVariant', () => {
  it('returns undefined for an unknown key', () => {
    expect(resolvePropVariant('dnd5e:props:nonexistent')).toBeUndefined();
  });

  it('returns undefined for an undefined key', () => {
    expect(resolvePropVariant(undefined)).toBeUndefined();
  });

  it('picks the first variant deterministically for a multi-variant key', () => {
    expect(resolvePropVariant('dnd5e:props:barrel')?.name).toBe(
      'SM_Prop_Barrel_01'
    );
    expect(resolvePropVariant('dnd5e:props:crate')?.name).toBe(
      'SM_Prop_Crate_Wood_02'
    );
  });

  it('rock-pile spans both an obstacle-role and a cover-role variant', () => {
    const variants = PROP_KEYS['dnd5e:props:rock-pile'];
    expect(variants?.map((v) => v.role).sort()).toEqual(['cover', 'obstacle']);
  });
});

describe('resolvePropModelUrl', () => {
  it('returns undefined for an unmapped key', () => {
    expect(resolvePropModelUrl('dnd5e:props:nonexistent')).toBeUndefined();
  });

  it('returns undefined for an undefined key', () => {
    expect(resolvePropModelUrl(undefined)).toBeUndefined();
  });

  it('builds a full model url for a known key', () => {
    expect(resolvePropModelUrl('dnd5e:props:pillar')).toBe(
      '/models/synty/props/SM_Env_Pillar_Round_01.glb'
    );
  });
});
