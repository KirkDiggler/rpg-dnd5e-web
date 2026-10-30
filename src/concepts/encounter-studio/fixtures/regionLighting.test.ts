import { describe, expect, it } from 'vitest';
import {
  contentWorkspace,
  LAYOUT_GRID_MARGIN,
} from '../../world-building/contentGrid';
import { resolveRegions } from '../../world-building/regionBoundaryGeometry';
import { projectRegionLighting } from '../../world-building/regionLighting';
import {
  parseRoomDocumentJson,
  regionCells,
  stringifyRoomDraft,
} from '../../world-building/roomDraft';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from '../../world-building/singleRoomDungeon';
import { scopeFrom } from '../../world-building/siteScope';
import { rectangleOf } from '../../world-building/workspaceGeometry';
import {
  createRegionLightingDocument,
  createSparseRegionLightingDocument,
  createUnresolvedRegionLightingDocument,
  LIGHTING_REGIONS,
} from './regionLighting';

const lit = Object.values(LIGHTING_REGIONS);

describe('canonical synthetic region lighting fixture', () => {
  // Regions are the floor (rpg-project#725): the four lit places are painted
  // regions, not automatic rooms or explicit label unions.
  it('certifies four painted lit regions with all scope and native surface nouns', () => {
    const base = createRegionLightingDocument();
    const configured = createRegionLightingDocument(true);
    const resolutions = resolveRegions(configured.draft);
    for (const id of lit)
      expect(resolutions.find((r) => r.id === id)?.status).toBe('resolved');
    expect(
      projectRegionLighting(
        configured.draft.room.regions,
        resolutions
      ).areas.map((a) => [a.regionId, a.background])
    ).toEqual([
      [LIGHTING_REGIONS.left, 0.15],
      [LIGHTING_REGIONS.right, 0.8],
      [LIGHTING_REGIONS.forest, 0.15],
      [LIGHTING_REGIONS.meadow, 0.8],
    ]);
    // The unconfigured base is the bright baseline: nothing projects.
    expect(
      projectRegionLighting(base.draft.room.regions, resolveRegions(base.draft))
        .areas
    ).toEqual([]);
    // Lighting is the only difference; full intensity is the baseline.
    const stripped = structuredClone(configured);
    for (const region of stripped.draft.room.regions)
      region.lighting = { intensity: 1 };
    expect(stripped).toEqual(base);
    // No cell is owned by two regions.
    const owners = new Map<string, string>();
    for (const region of configured.draft.room.regions)
      for (const cell of regionCells(region)) {
        const key = `${cell.q},${cell.r}`;
        expect(owners.get(key)).toBeUndefined();
        owners.set(key, region.id);
      }
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
    'preserves the complete document through JSON/YAML including configured or unpainted intent',
    (factory) => {
      const doc = factory(true);
      // Lighting lives on the region, so no scene version gate applies.
      expect(doc.draft.scene.version).toBe(
        createRegionLightingDocument().draft.scene.version
      );
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
        const resolutions = resolveRegions(doc.draft);
        expect(
          resolutions
            .filter((r) => r.status === 'unresolved')
            .map((r) => r.id)
            .sort()
        ).toEqual(['lighting-empty', 'lighting-unbound']);
        // Saved settings on unpainted regions are kept and draw nothing.
        expect(
          projectRegionLighting(doc.draft.room.regions, resolutions).areas.map(
            (a) => a.regionId
          )
        ).toEqual(lit);
        expect(
          doc.draft.room.regions.find((r) => r.id === 'lighting-unbound')
        ).toMatchObject({ cells: [], lighting: { intensity: 0.3 } });
        expect(doc.draft.room.regions.at(-1)).toMatchObject({
          id: 'lighting-empty',
          cells: [],
          lighting: { intensity: 1 },
        });
      }
    }
  );
  it('fits sparse content and many authored areas without inventing a renderer cap', () => {
    const doc = createSparseRegionLightingDocument();
    // The grid is derived from content (rpg-project#725): it covers the sparse
    // corners plus the margin, and the file carries no workspace.
    expect(doc.draft).not.toHaveProperty('workspace');
    const grid = contentWorkspace(doc.draft);
    const rect = rectangleOf(grid)!;
    const sparse = doc.draft.room.regions.filter((r) =>
      r.id.startsWith('lighting-sparse-')
    );
    for (const { q, r } of sparse.flatMap((region) => regionCells(region))) {
      const col = q + Math.floor(r / 2);
      expect(col - rect.minCol).toBeGreaterThanOrEqual(LAYOUT_GRID_MARGIN);
      expect(rect.minCol + rect.widthHexes - 1 - col).toBeGreaterThanOrEqual(
        LAYOUT_GRID_MARGIN
      );
      expect(r - rect.minRow).toBeGreaterThanOrEqual(LAYOUT_GRID_MARGIN);
      expect(rect.minRow + rect.heightHexes - 1 - r).toBeGreaterThanOrEqual(
        LAYOUT_GRID_MARGIN
      );
    }
    expect(sparse).toHaveLength(240);
    expect(
      projectRegionLighting(
        doc.draft.room.regions,
        resolveRegions(doc.draft)
      ).areas.map((a) => a.regionId)
    ).toEqual(sparse.map((r) => r.id));
    expect(stringifyRoomDraft(doc.draft, doc.scope).length).toBeLessThan(
      500000
    );
  });
});
