import { describe, expect, it } from 'vitest';
import {
  capWalkLights,
  deriveWalkLights,
  resolveAmbientIntensity,
  resolveDirectionalScale,
  WALK_LIGHT_DECAY,
  type LightableProp,
  type WalkPointLight,
} from './walkLighting';

function prop(
  key: string,
  ref: string,
  position: [number, number, number]
): LightableProp {
  return { key, position, variantRef: ref };
}

describe('deriveWalkLights', () => {
  it('produces one light per placed prop matching the Lighting category (brazier/candles/glowing-orb)', () => {
    const props: LightableProp[] = [
      prop('a', 'dnd5e:props:brazier', [1, 0, 2]),
      prop('b', 'dnd5e:props:candles', [3, 1.2, 4]),
      prop('c', 'dnd5e:props:glowing-orb', [5, 0, 6]),
    ];
    const lights = deriveWalkLights(props);
    expect(lights).toHaveLength(3);
    expect(lights.map((l) => l.position)).toEqual([
      [1, 0, 2],
      [3, 1.2, 4],
      [5, 0, 6],
    ]);
  });

  it('skips a placed prop whose ref is not a known light source', () => {
    const props: LightableProp[] = [
      prop('a', 'dnd5e:props:pillar', [0, 0, 0]),
      prop('b', 'dnd5e:props:statue-reaper', [1, 0, 1]),
    ];
    expect(deriveWalkLights(props)).toEqual([]);
  });

  it('a brazier gets the warm-orange, largest-reach spec; candles/glowing-orb their own cool accents', () => {
    const [brazier, candles, orb] = deriveWalkLights([
      prop('a', 'dnd5e:props:brazier', [0, 0, 0]),
      prop('b', 'dnd5e:props:candles', [0, 0, 0]),
      prop('c', 'dnd5e:props:glowing-orb', [0, 0, 0]),
    ]);
    expect(brazier).toMatchObject({
      color: '#ff9d52',
      intensity: 2.8,
      distance: 5.5,
    });
    expect(candles).toMatchObject({
      color: '#3ddc84',
      intensity: 2,
      distance: 4.5,
    });
    expect(orb).toMatchObject({
      color: '#3d84dc',
      intensity: 2,
      distance: 4.5,
    });
  });

  it('honors the prop key even with a namespaced multi-segment ref', () => {
    const lights = deriveWalkLights([
      prop('a', 'someother:namespace:brazier', [0, 0, 0]),
    ]);
    expect(lights).toHaveLength(1);
  });

  it('WALK_LIGHT_DECAY matches the game convention (2)', () => {
    expect(WALK_LIGHT_DECAY).toBe(2);
  });
});

describe('deriveWalkLights — 2026-08-07 Lighting category expansion (candle-stand/lantern/torch-ornate/rune-marker/rune-pillar)', () => {
  it("produces a light for every one of the 5 newly-added lighting refs, matching the game's own MOOD_LIGHT_SPEC_BY_PROP_REF values", () => {
    const props: LightableProp[] = [
      prop('a', 'dnd5e:props:candle-stand', [0, 0, 0]),
      prop('b', 'dnd5e:props:lantern', [0, 0, 0]),
      prop('c', 'dnd5e:props:torch-ornate', [0, 0, 0]),
      prop('d', 'dnd5e:props:rune-marker', [0, 0, 0]),
      prop('e', 'dnd5e:props:rune-pillar', [0, 0, 0]),
    ];
    const [candleStand, lantern, torchOrnate, runeMarker, runePillar] =
      deriveWalkLights(props);
    expect(candleStand).toMatchObject({
      color: '#ff9d52',
      intensity: 1.4,
      distance: 3.2,
    });
    expect(lantern).toMatchObject({
      color: '#ff9d52',
      intensity: 1.3,
      distance: 3,
    });
    expect(torchOrnate).toMatchObject({
      color: '#ff9d52',
      intensity: 1.6,
      distance: 3.6,
    });
    expect(runeMarker).toMatchObject({
      color: '#3d84dc',
      intensity: 0.7,
      distance: 2.2,
    });
    expect(runePillar).toMatchObject({
      color: '#3d84dc',
      intensity: 0.9,
      distance: 2.6,
    });
  });

  it('a Lighting-category prop not yet wired here would be silently inert — this test is the guard: every paletteData.ts LIGHTING_PROP_KEYS entry must produce a light', () => {
    // Local mirror of paletteData.ts's LIGHTING_PROP_KEYS (importing it
    // directly would pull in propManifest.ts/monsterModels.ts's proto
    // dependency into this pure-derivation test file) — the exact 8 keys,
    // kept in sync by hand same as walkLighting.ts's own LIGHT_SPEC_BY_PROP_REF.
    const lightingKeys = [
      'brazier',
      'candles',
      'glowing-orb',
      'candle-stand',
      'lantern',
      'torch-ornate',
      'rune-marker',
      'rune-pillar',
    ];
    const props = lightingKeys.map((key, i) =>
      prop(`k${i}`, `dnd5e:props:${key}`, [0, 0, 0])
    );
    expect(deriveWalkLights(props)).toHaveLength(lightingKeys.length);
  });

  it('torch (plain) and stone-lantern stay non-light-emitting, matching paletteData.ts categorizing them as obstacles-props', () => {
    const props: LightableProp[] = [
      prop('a', 'dnd5e:props:torch', [0, 0, 0]),
      prop('b', 'dnd5e:props:stone-lantern', [0, 0, 0]),
    ];
    expect(deriveWalkLights(props)).toEqual([]);
  });
});

function light(key: string, x: number, z: number): WalkPointLight {
  return { key, position: [x, 0, z], color: '#fff', intensity: 1, distance: 1 };
}

describe('capWalkLights', () => {
  it('is a no-op under budget', () => {
    const lights = [light('a', 0, 0), light('b', 1, 1)];
    expect(capWalkLights(lights, 5)).toEqual(lights);
  });

  it('without a reference, takes a plain positional slice', () => {
    const lights = [light('a', 0, 0), light('b', 1, 1), light('c', 2, 2)];
    const capped = capWalkLights(lights, 2);
    expect(capped.map((l) => l.key)).toEqual(['a', 'b']);
  });

  it('with a reference, keeps the nearest N — but preserves ORIGINAL array order in the result', () => {
    const lights = [
      light('far', 100, 100),
      light('near', 1, 0),
      light('mid', 10, 0),
    ];
    const capped = capWalkLights(lights, 2, [0, 0]);
    // near+mid are the 2 closest to (0,0); far is dropped.
    expect(capped.map((l) => l.key)).toEqual(['near', 'mid']);
  });

  it('does not mutate the input array', () => {
    const lights = [light('a', 0, 0), light('b', 1, 1), light('c', 2, 2)];
    const original = [...lights];
    capWalkLights(lights, 1, [0, 0]);
    expect(lights).toEqual(original);
  });
});

describe('resolveAmbientIntensity / resolveDirectionalScale', () => {
  it('defaults to 0.8 ambient / scale 1 when the doc has no lighting: block', () => {
    expect(resolveAmbientIntensity({ lighting: null })).toBe(0.8);
    expect(resolveDirectionalScale({ lighting: null })).toBe(1);
  });

  it('an explicit ambient: 0.8 (the annotated example’s own value) is a byte-identical no-op', () => {
    expect(resolveAmbientIntensity({ lighting: { ambient: 0.8 } })).toBe(0.8);
    expect(resolveDirectionalScale({ lighting: { ambient: 0.8 } })).toBe(1);
  });

  it('a low ambient darkens both the ambient value AND the directional scale proportionally', () => {
    expect(resolveAmbientIntensity({ lighting: { ambient: 0.1 } })).toBe(0.1);
    expect(resolveDirectionalScale({ lighting: { ambient: 0.1 } })).toBeCloseTo(
      0.125
    );
  });

  it('a bright ambient (near 1) scales directional lights up proportionally too', () => {
    expect(resolveDirectionalScale({ lighting: { ambient: 1 } })).toBeCloseTo(
      1.25
    );
  });
});
