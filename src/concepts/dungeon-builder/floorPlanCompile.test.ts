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
    expect(compileFloorPlanLocally(doc)).toEqual(SHOWCASE_FLOORPLAN);
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
