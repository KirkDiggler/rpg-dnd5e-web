import { describe, expect, it } from 'vitest';
import { parseDungeon } from './dungeonYaml';
import {
  S2_LOOP_FLOORPLAN,
  S2_LOOP_YAML,
  SHOWCASE_FLOORPLAN,
  SHOWCASE_YAML,
  SMOKE_TEST_FLOORPLAN,
  SMOKE_TEST_YAML,
} from './fixtures';
import { compileFloorPlanLocally } from './floorPlanCompile';

describe('compileFloorPlanLocally vs real recorded FloorPlan responses', () => {
  it('matches the real showcase.yaml response — a 3-room, non-uniform-width chain', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    // `edges` excluded deliberately: SHOWCASE_FLOORPLAN's `edges` (196
    // real recorded entries, rpg-project#169's wire-edges unit) is real
    // generated wall/door truth dungeonspec computes server-side.
    // `compileFloorPlanLocally` is this file's own doc comment's "grid
    // math is server-authoritative" fixtures-mode fallback — it was never
    // meant to (and doesn't) re-derive that generator step client-side, so
    // its own `edges` stays the proto default `[]` by construction. See
    // `edgesAdapter.test.ts` for the coverage that DOES assert on
    // `SHOWCASE_FLOORPLAN.edges` itself.
    expect(compileFloorPlanLocally(doc)).toEqual({
      ...SHOWCASE_FLOORPLAN,
      edges: [],
    });
  });

  it("matches PR #750's real smoke-test response", () => {
    const { doc } = parseDungeon(SMOKE_TEST_YAML);
    expect(compileFloorPlanLocally(doc)).toEqual(SMOKE_TEST_FLOORPLAN);
  });

  it("matches PR #752's real s2-loop-test response", () => {
    const { doc } = parseDungeon(S2_LOOP_YAML);
    expect(compileFloorPlanLocally(doc)).toEqual(S2_LOOP_FLOORPLAN);
  });
});
