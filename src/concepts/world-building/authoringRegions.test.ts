import { describe, expect, it } from 'vitest';
import { validateRegionPresentation } from './authoringRegions';

/**
 * A REGION'S LOOK (rpg-project#725 G4, design O2). The witness, label-link
 * and explicit-cell grammar of `scene.authoringRegions` retired; what this
 * module validates now is the presentation beside a region: a wall finish
 * (scene 6+) and the author's construction, carried verbatim and unread.
 */
describe('region presentation grammar', () => {
  const finish = {
    materialRef: 'dnd5e:material:test:large_gray',
    patternStart: {
      incoming: { wallId: 'a', direction: 'start-to-end' },
      outgoing: { wallId: 'b', direction: 'end-to-start' },
    },
  };

  it('carries a construction verbatim, whatever its shape, as a copy', () => {
    const construction = { rectangles: [[0, 0, 4, 2]], nested: { a: [1] } };
    const out = validateRegionPresentation(
      { hall: { construction } },
      { allowWallFinish: false }
    );
    expect(out).toEqual({ hall: { construction } });
    expect(out.hall!.construction).not.toBe(construction);
  });

  it('reads a wall finish only where the scene allows it', () => {
    expect(
      validateRegionPresentation(
        { hall: { wallFinish: finish } },
        { allowWallFinish: true }
      )
    ).toEqual({ hall: { wallFinish: finish } });
    expect(() =>
      validateRegionPresentation(
        { hall: { wallFinish: finish } },
        { allowWallFinish: false }
      )
    ).toThrow(
      'scene.regionPresentation.hall has an unsupported field: wallFinish.'
    );
  });

  it('refuses an empty entry, an unknown key and a non-mapping, naming the path', () => {
    expect(() =>
      validateRegionPresentation({ hall: {} }, { allowWallFinish: true })
    ).toThrow(
      'scene.regionPresentation.hall: declares nothing; omit the entry instead.'
    );
    expect(() =>
      validateRegionPresentation(
        { hall: { tint: 'red' } },
        { allowWallFinish: true }
      )
    ).toThrow('scene.regionPresentation.hall has an unsupported field: tint.');
    expect(() =>
      validateRegionPresentation([], { allowWallFinish: true })
    ).toThrow('scene.regionPresentation must be an object.');
  });
});
