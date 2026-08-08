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
  V03_CUT_FIELDS,
  v03CutFullySupported,
  type DialectField,
  type ServerCapabilities,
} from './capabilityProbe';

beforeEach(() => {
  hoisted.putDungeonFn.mockReset();
});

describe('DIALECT_FIELDS', () => {
  it('has no duplicate entries', () => {
    expect(new Set(DIALECT_FIELDS).size).toBe(DIALECT_FIELDS.length);
  });
});

function capsFrom(accepted: readonly DialectField[]): ServerCapabilities {
  return Object.fromEntries(
    DIALECT_FIELDS.map((f) => [f, { accepted: accepted.includes(f) }])
  ) as ServerCapabilities;
}

describe('V03_CUT_FIELDS — the ratified v0.3 level cut (spec.md §1 groups b/c/d)', () => {
  it('is exactly the 6 fields spec.md §1 groups (b)/(c)/(d) name — walls/start/facingFloorProp (b), canvas/topLevelPlace (c, Wave 0), regions (d, Wave 1)', () => {
    expect([...V03_CUT_FIELDS].sort()).toEqual(
      [
        'walls',
        'start',
        'facingFloorProp',
        'canvas',
        'topLevelPlace',
        'regions',
      ].sort()
    );
  });

  it('is a strict subset of DIALECT_FIELDS — every cut field is a real probed field', () => {
    for (const field of V03_CUT_FIELDS) {
      expect(DIALECT_FIELDS).toContain(field);
    }
  });

  it('excludes facingMonster/facingBoss/facingWallMount — spec §4.9.3 REQUIRES these rejected, not merely "not yet accepted"', () => {
    expect(V03_CUT_FIELDS.has('facingMonster')).toBe(false);
    expect(V03_CUT_FIELDS.has('facingBoss')).toBe(false);
    expect(V03_CUT_FIELDS.has('facingWallMount')).toBe(false);
  });
});

describe('v03CutFullySupported', () => {
  it("is true against TODAY's real Wave-1 verification-server state: exactly the 6 cut fields accepted, all 11 others rejected", () => {
    expect(v03CutFullySupported(capsFrom([...V03_CUT_FIELDS]))).toBe(true);
  });

  it('is false the moment even one cut field is rejected', () => {
    const [, ...missingOne] = [...V03_CUT_FIELDS];
    expect(v03CutFullySupported(capsFrom(missingOne))).toBe(false);
  });

  it('is true at 17/17 — accepting every field trivially includes every cut field', () => {
    expect(v03CutFullySupported(capsFrom(DIALECT_FIELDS))).toBe(true);
  });

  it('is false when only non-cut (draft-tier/rejection-mandated) fields are accepted', () => {
    const nonCut = DIALECT_FIELDS.filter((f) => !V03_CUT_FIELDS.has(f));
    expect(v03CutFullySupported(capsFrom(nonCut))).toBe(false);
  });

  it('is false against an empty/all-rejected server', () => {
    expect(v03CutFullySupported(capsFrom([]))).toBe(false);
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

// The fields whose only legal document mode is canvas mode (spec v0.3
// §4.5.1/§4.6.1/§4.10.3.8) — mirrors capabilityProbe.ts's own private
// CANVAS_FAMILY_FIELDS, kept here as a literal (not exported) so this
// test suite verifies the OBSERVABLE request shape, not an implementation
// detail.
const CANVAS_FAMILY = ['canvas', 'topLevelPlace', 'regions'] as const;

function callFor(field: string) {
  const key = `capprobe-${field.toLowerCase()}`;
  const call = hoisted.putDungeonFn.mock.calls.find(
    (call: unknown[]) => (call[0] as PutDungeonRequest).key === key
  );
  if (!call) throw new Error(`no putDungeon call recorded for ${key}`);
  return call[0] as PutDungeonRequest;
}

describe('buildProbeDoc mode selection — the bug this unit fixes', () => {
  beforeEach(() => {
    hoisted.putDungeonFn.mockResolvedValue({ success: true, fieldErrors: [] });
  });

  it('sends canvas-family fields (canvas, topLevelPlace, regions) on a canvas-mode base: canvas: present, rooms: [] — never a non-empty room chain', async () => {
    await probeAllCapabilities();

    for (const field of CANVAS_FAMILY) {
      const { yaml } = callFor(field);
      expect(yaml).toMatch(/^canvas: \{/m);
      expect(yaml).toMatch(/^rooms: \[\]/m);
      expect(yaml).not.toMatch(/- id: entry/);
      expect(yaml).not.toMatch(/^connectors:/m);
    }
  });

  it('sends every other field on the room-chain base: non-empty rooms:, no top-level canvas:', async () => {
    await probeAllCapabilities();

    const chainFields = DIALECT_FIELDS.filter(
      (f) => !(CANVAS_FAMILY as readonly string[]).includes(f)
    );
    expect(chainFields.length).toBe(
      DIALECT_FIELDS.length - CANVAS_FAMILY.length
    );

    for (const field of chainFields) {
      const { yaml } = callFor(field);
      expect(yaml).toMatch(/- id: entry/);
      expect(yaml).not.toMatch(/^canvas: \{/m);
    }
  });

  it('never sends a document combining non-empty rooms: with canvas: — the illegal mode combo the old probe used to send', async () => {
    await probeAllCapabilities();

    for (const call of hoisted.putDungeonFn.mock.calls) {
      const { yaml } = call[0] as PutDungeonRequest;
      const hasNonEmptyRooms = /- id: entry/.test(yaml);
      const hasCanvas = /^canvas: \{/m.test(yaml);
      expect(hasNonEmptyRooms && hasCanvas).toBe(false);
    }
  });
});

describe('classify against captured Wave-0 server messages (live-verified 2026-08-06, localhost:8092)', () => {
  it('canvas: accepted, no message — matches the live 200-cell FloorPlan response', async () => {
    hoisted.putDungeonFn.mockImplementation(async (req: PutDungeonRequest) => {
      if (req.key === 'capprobe-canvas') {
        return { success: true, fieldErrors: [] };
      }
      return {
        success: false,
        fieldErrors: [{ field: '', message: 'irrelevant' }],
      };
    });

    const caps = await probeAllCapabilities();
    expect(caps.canvas).toEqual({ accepted: true });
  });

  it('topLevelPlace: accepted on the canvas-mode base — matches the live response', async () => {
    hoisted.putDungeonFn.mockImplementation(async (req: PutDungeonRequest) => {
      if (req.key === 'capprobe-toplevelplace') {
        return { success: true, fieldErrors: [] };
      }
      return {
        success: false,
        fieldErrors: [{ field: '', message: 'irrelevant' }],
      };
    });

    const caps = await probeAllCapabilities();
    expect(caps.topLevelPlace).toEqual({ accepted: true });
  });

  it('regions: still honestly rejected — decode-unknown, verbatim, since Wave 1 (rpg-project#180) has not shipped', async () => {
    const message =
      'decode dungeon spec: yaml: unmarshal errors:\n  line 6: field regions not found in type dungeonspec.DungeonSpec';
    hoisted.putDungeonFn.mockImplementation(async (req: PutDungeonRequest) => {
      if (req.key === 'capprobe-regions') {
        return { success: false, fieldErrors: [{ field: '', message }] };
      }
      return { success: true, fieldErrors: [] };
    });

    const caps = await probeAllCapabilities();
    expect(caps.regions).toEqual({ accepted: false, message });
  });

  it('mount: schema-known rejection threads the field-path-prefixed message verbatim (the live message now includes a path prefix the 2026-08-04 transcript did not record)', async () => {
    const message =
      'rooms[0].place[0].mount: unsupported capability: mounted placements are not supported';
    hoisted.putDungeonFn.mockImplementation(async (req: PutDungeonRequest) => {
      if (req.key === 'capprobe-mount') {
        return { success: false, fieldErrors: [{ field: '', message }] };
      }
      return { success: true, fieldErrors: [] };
    });

    const caps = await probeAllCapabilities();
    expect(caps.mount).toEqual({ accepted: false, message });
  });

  it('facingBoss: schema-known rejection wording updated to "floor props" (was "room-scoped floor props") — threaded verbatim either way', async () => {
    const message =
      'rooms[2].boss.facing: unsupported capability: facing only supported on floor props';
    hoisted.putDungeonFn.mockImplementation(async (req: PutDungeonRequest) => {
      if (req.key === 'capprobe-facingboss') {
        return { success: false, fieldErrors: [{ field: '', message }] };
      }
      return { success: true, fieldErrors: [] };
    });

    const caps = await probeAllCapabilities();
    expect(caps.facingBoss).toEqual({ accepted: false, message });
  });

  it('end-to-end: a server simulator matching the real Wave-0 combo/decode/accept rules yields 5/17 accepted, with regions honestly still rejected', async () => {
    // Simplified but faithful simulator of the real Wave-0 server's
    // relevant decisions (verified live, 2026-08-06): reject the
    // rooms+canvas combo; accept a mode-correct canvas base and
    // top-level place on it; still decode-unknown regions (Wave 1 not
    // shipped); accept the three chain fields already known to compile;
    // decode-unknown everything else. This is the regression test for
    // the bug itself — under the OLD (pre-fix) buildProbeDoc, canvas and
    // topLevelPlace would both hit the combo-rejection branch below and
    // this test would see 3/17, not 5/17.
    hoisted.putDungeonFn.mockImplementation(async (req: PutDungeonRequest) => {
      const { yaml, key } = req;
      const hasNonEmptyRooms = /- id: entry/.test(yaml);
      const hasCanvas = /^canvas: \{/m.test(yaml);

      if (hasNonEmptyRooms && hasCanvas) {
        return {
          success: false,
          fieldErrors: [
            {
              field: '',
              message:
                'canvas mode rooms must be an explicit empty sequence (rooms: [])',
            },
          ],
        };
      }
      if (hasCanvas) {
        if (/^regions:/m.test(yaml)) {
          return {
            success: false,
            fieldErrors: [
              {
                field: '',
                message:
                  'decode dungeon spec: yaml: unmarshal errors:\n  line 6: field regions not found in type dungeonspec.DungeonSpec',
              },
            ],
          };
        }
        return { success: true, fieldErrors: [] }; // bare canvas base, or canvas + place
      }
      if (
        [
          'capprobe-walls',
          'capprobe-start',
          'capprobe-facingfloorprop',
        ].includes(key)
      ) {
        return { success: true, fieldErrors: [] };
      }
      return {
        success: false,
        fieldErrors: [
          {
            field: '',
            message: `field ${key} not found in type dungeonspec.DungeonSpec`,
          },
        ],
      };
    });

    const caps = await probeAllCapabilities();

    expect(caps.canvas.accepted).toBe(true);
    expect(caps.topLevelPlace.accepted).toBe(true);
    expect(caps.regions.accepted).toBe(false);
    expect(caps.regions.message).toContain(
      'field regions not found in type dungeonspec.DungeonSpec'
    );
    expect(caps.walls.accepted).toBe(true);
    expect(caps.start.accepted).toBe(true);
    expect(caps.facingFloorProp.accepted).toBe(true);
    expect(capabilitySummary(caps)).toEqual({
      accepted: 5,
      total: DIALECT_FIELDS.length,
    });
  });
});
