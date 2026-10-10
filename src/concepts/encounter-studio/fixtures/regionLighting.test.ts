import { describe, expect, it } from 'vitest';
import { resolveAuthoringRegions } from '../../world-building/regionBoundaryGeometry';
import { projectRegionLighting } from '../../world-building/regionLighting';
import {
  parseRoomDocumentJson,
  stringifyRoomDraft,
} from '../../world-building/roomDraft';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from '../../world-building/singleRoomDungeon';
import { scopeFrom } from '../../world-building/siteScope';
import {
  createRegionLightingDocument,
  createSparseRegionLightingDocument,
  createUnresolvedRegionLightingDocument,
} from './regionLighting';

describe('canonical synthetic region lighting fixture', () => {
  it('certifies two automatic rooms and sparse explicit unions with all scope and native surface nouns', () => {
    const base = createRegionLightingDocument();
    const configured = createRegionLightingDocument(true);
    const resolutions = resolveAuthoringRegions(configured.draft);
    expect(resolutions.map((r) => r.status)).toEqual([
      'resolved',
      'resolved',
      'resolved',
      'resolved',
    ]);
    expect(
      projectRegionLighting(
        configured.draft.scene.authoringRegions!,
        resolutions
      ).areas
    ).toHaveLength(4);
    const stripped = structuredClone(configured);
    stripped.draft.scene.version = 3;
    for (const region of stripped.draft.scene.authoringRegions!)
      delete region.lighting;
    expect(stripped).toEqual(base);
    expect(Object.keys(base.scope).sort()).toEqual([
      'concealments',
      'dispositions',
      'endings',
      'exits',
      'factions',
      'intel',
      'scenarios',
      'tables',
    ]);
    expect(base.draft.room.partyStart).toBeDefined();
    expect(base.draft.room.walls!.at(-1)!.openings[0].door?.id).toBe(
      'studio-door'
    );
    expect(
      base.draft.scene.items.some(
        (p) => p.id === 'lighting-torch' && p.pointLight?.enabled
      )
    ).toBe(true);
    expect(createRegionLightingDocument(true)).toEqual(configured);
  });
  it.each([
    createRegionLightingDocument,
    createUnresolvedRegionLightingDocument,
  ])(
    'preserves complete scene4 JSON/YAML including configured or unresolved/unbound/empty intent',
    (factory) => {
      const doc = factory(true);
      expect(doc.draft.scene.version).toBe(4);
      const decoded = decodeSingleRoomDungeon(
        encodeSingleRoomDungeon({
          key: 'region-lighting-carriage',
          draft: doc.draft,
          ...doc.scope,
        })
      );
      expect(
        parseRoomDocumentJson(
          stringifyRoomDraft(decoded.draft, scopeFrom(decoded))
        )
      ).toEqual(doc);
      if (factory === createUnresolvedRegionLightingDocument) {
        const resolutions = resolveAuthoringRegions(doc.draft);
        expect(
          resolutions.filter((r) => r.status === 'unresolved')
        ).toHaveLength(4);
        expect(
          projectRegionLighting(doc.draft.scene.authoringRegions!, resolutions)
            .areas
        ).toHaveLength(2);
        expect(doc.draft.scene.authoringRegions!.at(-1)).toMatchObject({
          boundary: { kind: 'explicit', cells: [] },
          lighting: { background: 1 },
        });
      }
    }
  );
  it('fits realistic sparse maximum bounds and many authored areas without inventing a renderer cap', () => {
    const doc = createSparseRegionLightingDocument();
    expect(doc.draft.workspace).toMatchObject({
      widthHexes: 128,
      heightHexes: 128,
    });
    expect(doc.draft.scene.authoringRegions).toHaveLength(240);
    expect(
      projectRegionLighting(
        doc.draft.scene.authoringRegions!,
        resolveAuthoringRegions(doc.draft)
      ).areas
    ).toHaveLength(240);
    expect(stringifyRoomDraft(doc.draft, doc.scope).length).toBeLessThan(
      500000
    );
  });
});
