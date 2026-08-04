import type { PutDungeonRequest } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  putDungeonFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  authoringClient: { putDungeon: hoisted.putDungeonFn },
}));

// Import AFTER vi.mock so the mock is applied.
import {
  anyCapabilityAccepted,
  capabilitySummary,
  DIALECT_FIELDS,
  probeAllCapabilities,
} from './capabilityProbe';

beforeEach(() => {
  hoisted.putDungeonFn.mockReset();
});

describe('DIALECT_FIELDS', () => {
  it('has no duplicate entries', () => {
    expect(new Set(DIALECT_FIELDS).size).toBe(DIALECT_FIELDS.length);
  });
});

describe('probeAllCapabilities', () => {
  it('marks every field accepted when the server returns success:true for every probe', async () => {
    hoisted.putDungeonFn.mockResolvedValue({ success: true, fieldErrors: [] });

    const caps = await probeAllCapabilities();

    for (const field of DIALECT_FIELDS) {
      expect(caps[field].accepted).toBe(true);
      expect(caps[field].message).toBeUndefined();
    }
    expect(capabilitySummary(caps)).toEqual({
      accepted: DIALECT_FIELDS.length,
      total: DIALECT_FIELDS.length,
    });
    expect(anyCapabilityAccepted(caps)).toBe(true);
  });

  it('marks every field rejected, with the server message threaded through verbatim, when every probe fails', async () => {
    hoisted.putDungeonFn.mockResolvedValue({
      success: false,
      fieldErrors: [
        {
          field: '',
          message: 'field X not found in type dungeonspec.DungeonSpec',
        },
      ],
    });

    const caps = await probeAllCapabilities();

    for (const field of DIALECT_FIELDS) {
      expect(caps[field].accepted).toBe(false);
      expect(caps[field].message).toBe(
        'field X not found in type dungeonspec.DungeonSpec'
      );
    }
    expect(capabilitySummary(caps)).toEqual({
      accepted: 0,
      total: DIALECT_FIELDS.length,
    });
    expect(anyCapabilityAccepted(caps)).toBe(false);
  });

  it('distinguishes accepted vs rejected fields on a per-request basis, keyed off the probe key', async () => {
    // Every probe uses a distinct `capprobe-<field>` key (case-lowered) —
    // real capabilityProbe.ts contract, verified against the module's own
    // buildProbeDoc/probeAllCapabilities. Accept only the `walls` and
    // `start` probes, exactly like the real live server this unit
    // verified against (2026-08-04).
    hoisted.putDungeonFn.mockImplementation(async (req: PutDungeonRequest) => {
      if (req.key === 'capprobe-walls' || req.key === 'capprobe-start') {
        return { success: true, fieldErrors: [] };
      }
      return {
        success: false,
        fieldErrors: [{ field: '', message: `rejected: ${req.key}` }],
      };
    });

    const caps = await probeAllCapabilities();

    expect(caps.walls.accepted).toBe(true);
    expect(caps.start.accepted).toBe(true);
    expect(caps.end.accepted).toBe(false);
    expect(caps.canvas.accepted).toBe(false);
    expect(caps.facingFloorProp.accepted).toBe(false);
    expect(capabilitySummary(caps)).toEqual({
      accepted: 2,
      total: DIALECT_FIELDS.length,
    });
  });

  it('a transport failure on one probe is recorded as rejected with the error message, not thrown', async () => {
    hoisted.putDungeonFn.mockImplementation(async (req: PutDungeonRequest) => {
      if (req.key === 'capprobe-canvas') {
        throw new Error('failed to fetch');
      }
      return { success: true, fieldErrors: [] };
    });

    const caps = await probeAllCapabilities();

    expect(caps.canvas.accepted).toBe(false);
    expect(caps.canvas.message).toBe('failed to fetch');
    // Every other field's probe still resolved normally — one failing
    // request never takes down the whole suite.
    expect(caps.walls.accepted).toBe(true);
  });

  it('every probe request declares validateOnly: true — never a real write', async () => {
    hoisted.putDungeonFn.mockResolvedValue({ success: true, fieldErrors: [] });
    await probeAllCapabilities();
    expect(hoisted.putDungeonFn).toHaveBeenCalledTimes(DIALECT_FIELDS.length);
    for (const call of hoisted.putDungeonFn.mock.calls) {
      const req = call[0] as PutDungeonRequest;
      expect(req.validateOnly).toBe(true);
    }
  });
});
