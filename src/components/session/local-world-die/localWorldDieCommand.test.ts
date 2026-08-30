import { describe, expect, it } from 'vitest';
import {
  localWorldDieCommandTerminal,
  localWorldDieDynamicState,
  type LocalWorldDieCommand,
} from './localWorldDieCommand';
import type { LocalWorldDieWitnessPlan } from './localWorldDieWitnessPlan';

const initialState = {
  position: { x: 1, y: 1.25, z: 2 },
  rotation: { x: 0.1, y: 0.2, z: 0.3, w: 0.92736185 },
  linearVelocity: { x: 1, y: 0.8, z: -0.25 },
  angularVelocity: { x: 2, y: 3, z: -4 },
};
const terminalState = {
  position: { x: 2, y: 0.3, z: 2 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  linearVelocity: { x: 0, y: 0, z: 0 },
  angularVelocity: { x: 0, y: 0, z: 0 },
};
const witnessPlan: LocalWorldDieWitnessPlan = {
  presentationId: 'session:session-1:42',
  authoritySeq: 42n,
  roller: 'fighter-1',
  attempt: 1,
  fingerprint: new Uint8Array(32).fill(7),
  initialState,
  terminal: {
    kind: 'settled',
    step: 42,
    elapsedMs: 0,
    fingerprint: new Uint8Array(32).fill(7),
    initialState,
    terminalState,
  },
};

function witnessCommand(): LocalWorldDieCommand {
  return { id: 7, kind: 'witness', plan: witnessPlan };
}

describe('LocalWorldDieLayer witness command', () => {
  it('starts the shared body from the accepted wire pose and velocities', () => {
    expect(localWorldDieDynamicState(witnessCommand())).toEqual({
      position: { x: 1, y: 1.25, z: 2 },
      rotation: { x: 0.1, y: 0.2, z: 0.3, w: 0.92736185 },
      linearVelocity: { x: 1, y: 0.8, z: -0.25 },
      angularVelocity: { x: 2, y: 3, z: -4 },
    });
  });

  it('uses the accepted terminal instead of local settlement detection', () => {
    expect(localWorldDieCommandTerminal(witnessCommand())).toMatchObject({
      kind: 'settled',
      step: 42,
    });
  });
});
