import { describe, expect, it } from 'vitest';
import { FEEL_LAB_LAYER_Z } from './layer';

describe('FEEL_LAB_LAYER_Z', () => {
  it('clears every known stacking layer a live session route can raise', () => {
    // SessionEncounterView's portal (100) and its "run ended" overlay
    // (1000) are the layers this constant was created to clear — see
    // layer.ts's own doc comment for the incident.
    expect(FEEL_LAB_LAYER_Z).toBeGreaterThan(1000);
    // The generic Dialog reaches 3010.
    expect(FEEL_LAB_LAYER_Z).toBeGreaterThan(3010);
  });

  it('stays below the real toast layer so a critical toast still wins', () => {
    expect(FEEL_LAB_LAYER_Z).toBeLessThan(99999);
  });
});
