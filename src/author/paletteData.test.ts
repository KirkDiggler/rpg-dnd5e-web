import { resolveMonsterModelUrl } from '@/components/hex-grid/monsterModels';
import { PROP_KEYS } from '@/components/hex-grid/propManifest';
import { describe, expect, it } from 'vitest';
import {
  categoryForProp,
  PALETTE_MONSTERS,
  PALETTE_PROPS,
  thumbForRef,
} from './paletteData';

describe('PALETTE_PROPS (2026-08-07 palette content sync — full manifest vocabulary)', () => {
  it('has one entry per propManifest.ts key — the full 44-key vocabulary, not the old 12-key showcase-only scope', () => {
    expect(PALETTE_PROPS.length).toBe(Object.keys(PROP_KEYS).length);
  });

  it('every entry ref exists in PROP_KEYS with a matching role', () => {
    for (const p of PALETTE_PROPS) {
      const variant = PROP_KEYS[p.ref]?.[0];
      expect(variant).toBeDefined();
      expect(p.role).toBe(variant?.role);
    }
  });

  it('has no duplicate refs', () => {
    const refs = PALETTE_PROPS.map((p) => p.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('includes both long-standing showcase props and newly-synced ones (barrel, rug, rune-marker were absent from the old 12-key list)', () => {
    const refs = new Set(PALETTE_PROPS.map((p) => p.ref));
    expect(refs.has('dnd5e:props:pillar')).toBe(true); // pre-existing
    expect(refs.has('dnd5e:props:barrel')).toBe(true); // newly added
    expect(refs.has('dnd5e:props:rug')).toBe(true); // newly added
    expect(refs.has('dnd5e:props:rune-marker')).toBe(true); // newly added
  });
});

describe('categoryForProp — Lighting category (8 keys, game-derived)', () => {
  const lightingRefs = [
    'dnd5e:props:brazier',
    'dnd5e:props:candles',
    'dnd5e:props:glowing-orb',
    'dnd5e:props:candle-stand',
    'dnd5e:props:lantern',
    'dnd5e:props:torch-ornate',
    'dnd5e:props:rune-marker',
    'dnd5e:props:rune-pillar',
  ];

  it.each(lightingRefs)('%s categorizes as lighting', (ref) => {
    expect(categoryForProp(ref)).toBe('lighting');
  });

  it('plain torch (TorchStick) is NOT lighting — the game itself does not classify it as a light source', () => {
    expect(categoryForProp('dnd5e:props:torch')).toBe('obstacles-props');
  });

  it('stone-lantern is NOT lighting — same reasoning, matches the game table', () => {
    expect(categoryForProp('dnd5e:props:stone-lantern')).toBe(
      'obstacles-props'
    );
  });

  it('an ordinary obstacle/decor prop falls back to obstacles-props', () => {
    expect(categoryForProp('dnd5e:props:pillar')).toBe('obstacles-props');
    expect(categoryForProp('dnd5e:props:barrel')).toBe('obstacles-props');
  });
});

describe('PALETTE_MONSTERS (2026-08-07 palette content sync — ref-AND-GLB test)', () => {
  it('includes skeleton, skeleton-captain, and zombie — every ref with a promoted GLB', () => {
    const refIds = PALETTE_MONSTERS.map((m) => m.refId).sort();
    expect(refIds).toEqual(['skeleton', 'skeleton-captain', 'zombie']);
  });

  it('excludes ghoul and skeleton-archer — real toolkit refs, no promoted GLB', () => {
    const refIds = new Set(PALETTE_MONSTERS.map((m) => m.refId));
    expect(refIds.has('ghoul')).toBe(false);
    expect(refIds.has('skeleton-archer')).toBe(false);
  });

  it('excludes ghost/specter/tormented-soul — promoted GLBs exist, but no toolkit ref does', () => {
    const refIds = new Set(PALETTE_MONSTERS.map((m) => m.refId));
    expect(refIds.has('ghost')).toBe(false);
    expect(refIds.has('specter')).toBe(false);
    expect(refIds.has('tormented-soul')).toBe(false);
  });

  it('every entry actually resolves a model url (the ref-AND-GLB test, verified not asserted)', () => {
    for (const m of PALETTE_MONSTERS) {
      expect(resolveMonsterModelUrl(m.refId, undefined, false)).toBeDefined();
    }
  });

  it('zombie gets exactly ONE palette entry despite having two promoted looks', () => {
    expect(PALETTE_MONSTERS.filter((m) => m.refId === 'zombie')).toHaveLength(
      1
    );
  });

  it('only skeleton-captain is marked bossable — narrower scope, not extended to skeleton/zombie this round', () => {
    const bossable = PALETTE_MONSTERS.filter((m) => m.bossable).map(
      (m) => m.refId
    );
    expect(bossable).toEqual(['skeleton-captain']);
  });

  it('has no duplicate refs', () => {
    const refs = PALETTE_MONSTERS.map((m) => m.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });
});

describe('thumbForRef — every palette entry has a baked thumbnail (2026-08-07 bake)', () => {
  it('every PALETTE_PROPS ref resolves a thumbnail', () => {
    const missing = PALETTE_PROPS.filter((p) => !thumbForRef(p.ref)).map(
      (p) => p.ref
    );
    expect(missing).toEqual([]);
  });

  it('every PALETTE_MONSTERS ref resolves a thumbnail', () => {
    const missing = PALETTE_MONSTERS.filter((m) => !thumbForRef(m.ref)).map(
      (m) => m.ref
    );
    expect(missing).toEqual([]);
  });
});
