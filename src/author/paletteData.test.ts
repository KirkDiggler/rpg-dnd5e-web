// @vitest-environment node
import { resolveMonsterModelUrl } from '@/components/hex-grid/monsterModels';
import { PROP_KEYS } from '@/components/hex-grid/propManifest';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DUNGEON_LIGHT_SOURCE_REFS } from '../rendering/dungeonLightSources';
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

  it('includes generated exact refs with provider labels and explicit behavior', () => {
    expect(
      PALETTE_PROPS.find(
        (prop) => prop.ref === 'dnd5e:props:plushie:skeleton-dog'
      )
    ).toMatchObject({
      label: 'Skele Dog Plushie',
      role: 'decor',
      blocksMovement: false,
      blocksLoS: false,
    });
    expect(
      PALETTE_PROPS.some((prop) => prop.ref === 'dnd5e:props:plushie')
    ).toBe(false);
  });

  it('hands explicit generated behavior to DungeonBuilder instead of re-deriving it from role', () => {
    const builder = readFileSync('src/author/DungeonBuilder.tsx', 'utf8');
    expect(builder).toContain('blocksMovement: p.blocksMovement');
    expect(builder).toContain('blocksLos: p.blocksLoS');
    expect(builder).not.toContain("blocksMovement: p.role !== 'decor'");
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

describe('categoryForProp — Lighting category (8 keys, shared manifest)', () => {
  it.each(DUNGEON_LIGHT_SOURCE_REFS)('%s categorizes as lighting', (ref) => {
    expect(categoryForProp(ref)).toBe('lighting');
  });

  it('derives lighting authority from dungeonLightSources.ts rather than a duplicate table', () => {
    for (const ref of DUNGEON_LIGHT_SOURCE_REFS) {
      expect(categoryForProp(ref)).toBe('lighting');
    }
    expect(readFileSync('src/author/paletteData.ts', 'utf8')).not.toContain(
      'LIGHTING_PROP_KEYS'
    );
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
  it('includes every ref with both a toolkit identity and a promoted GLB', () => {
    const refIds = PALETTE_MONSTERS.map((m) => m.refId).sort();
    expect(refIds).toEqual([
      'animated-armor',
      'goblin',
      'goblin-boss',
      'skeleton',
      'skeleton-captain',
      'zombie',
    ]);
  });

  it('offers the goblin boss and its mooks together — a boss with nobody to lead is half a scene', () => {
    const refIds = new Set(PALETTE_MONSTERS.map((m) => m.refId));
    expect(refIds.has('goblin')).toBe(true);
    expect(refIds.has('goblin-boss')).toBe(true);
  });

  it('gives goblin ONE palette entry even though the ref renders three looks', () => {
    // The author places a ref; the board is what shows three faces. If this
    // ever grew to three entries the palette would be lying about what
    // dungeonspec can express — a `place:` line carries a ref and nothing
    // else.
    expect(PALETTE_MONSTERS.filter((m) => m.refId === 'goblin')).toHaveLength(
      1
    );
  });

  it('goblin-boss discloses its multiattack in `sub` — the reason to place one', () => {
    const boss = PALETTE_MONSTERS.find((m) => m.refId === 'goblin-boss');
    expect(boss).toBeDefined();
    expect(boss!.sub).toMatch(/second at disadvantage/);
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

  it('animated-armor discloses in `sub` that it vanishes when downed', () => {
    // The palette is where an author picks what to build a scene around, and
    // the armor is the only entry whose body disappears on death (no downed
    // model exists). A thumbnail and a name cannot convey that; the sub-label
    // is the only place it reaches the author before they place one.
    const armor = PALETTE_MONSTERS.find((m) => m.refId === 'animated-armor');
    expect(armor).toBeDefined();
    expect(armor!.sub).toMatch(/vanishes when it drops/);
  });

  it('marks bossable only where the RULES identity is boss-shaped, not every monster', () => {
    const bossable = PALETTE_MONSTERS.filter((m) => m.bossable).map(
      (m) => m.refId
    );
    expect(bossable).toEqual(['skeleton-captain', 'goblin-boss']);
  });

  it('does not let a mook-tier ref be pinned as a boss — goblin included', () => {
    // Whether a boss room may feature a mook is a real design question that
    // nobody has answered. Until somebody does, the plain goblin cannot be
    // pinned, exactly as skeleton and zombie cannot.
    const notBossable = ['skeleton', 'zombie', 'animated-armor', 'goblin'];
    for (const refId of notBossable) {
      expect(
        PALETTE_MONSTERS.find((m) => m.refId === refId)?.bossable
      ).toBeUndefined();
    }
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
