// @vitest-environment node
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  inspectPngEvidence,
  preflightPngEvidence,
  validatePngEvidenceSequence,
} from './pngEvidenceValidation';

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1)
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data = new Uint8Array()) {
  const bytes = new Uint8Array(12 + data.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.byteLength);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  view.setUint32(
    8 + data.byteLength,
    crc32(bytes.subarray(4, 8 + data.byteLength))
  );
  return bytes;
}

function png(
  options: {
    width?: number;
    height?: number;
    rows?: Uint8Array;
    chunks?: readonly Uint8Array[];
  } = {}
) {
  const width = options.width ?? 2;
  const height = options.height ?? 2;
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const rows =
    options.rows ??
    Uint8Array.from([0, 0, 0, 0, 255, 255, 255, 0, 255, 0, 0, 0, 0, 255]);
  const chunks = options.chunks ?? [
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND'),
  ];
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunks.flatMap((value) => [...value]),
  ]);
}

function mutateChunkCrc(bytes: Uint8Array, type: string) {
  const copy = bytes.slice();
  let offset = 8;
  const view = new DataView(copy.buffer);
  while (offset < copy.byteLength) {
    const length = view.getUint32(offset);
    const chunkType = new TextDecoder().decode(
      copy.subarray(offset + 4, offset + 8)
    );
    if (chunkType === type) {
      copy[offset + 8 + length] ^= 0xff;
      return copy;
    }
    offset += 12 + length;
  }
  throw Error(`chunk not found: ${type}`);
}

describe('generic sequential PNG evidence validation', () => {
  it('preflights aggregate decoded resources, then inspects each image once into scalars', () => {
    const first = png();
    const second = png({
      rows: Uint8Array.from([
        0, 10, 20, 30, 40, 50, 60, 0, 70, 80, 90, 100, 110, 120,
      ]),
    });
    const inspected: string[] = [];
    const result = validatePngEvidenceSequence(
      [
        { path: 'first.png', bytes: first, requireReadableContent: true },
        { path: 'second.png', bytes: second, requireReadableContent: true },
      ],
      {
        maxAggregateDecodedBytes: 24,
        onInspected: (path) => inspected.push(path),
      }
    );
    expect(result.aggregateDecodedBytes).toBe(24);
    expect(result.images).toEqual([
      expect.objectContaining({
        path: 'first.png',
        width: 2,
        height: 2,
        decodedBytes: 12,
      }),
      expect.objectContaining({
        path: 'second.png',
        width: 2,
        height: 2,
        decodedBytes: 12,
      }),
    ]);
    expect(result.images.every((image) => image.readableContent)).toBe(true);
    expect(inspected).toEqual(['first.png', 'second.png']);
  });

  it('reconstructs every legal PNG filter and measures a contained contrast region', () => {
    for (const filter of [0, 1, 2, 3, 4]) {
      const rows = Uint8Array.from([
        filter,
        0,
        0,
        0,
        255,
        255,
        255,
        filter,
        255,
        0,
        0,
        0,
        0,
        255,
      ]);
      const result = inspectPngEvidence(png({ rows }), `filter-${filter}`, {
        contrastRegion: { left: 0, top: 0, width: 2, height: 2 },
      });
      expect(result.width).toBe(2);
      expect(result.contrastRatio).toBeGreaterThan(1);
    }
  });

  it.each([
    ['truncated signature', (bytes: Uint8Array) => bytes.subarray(0, 7)],
    ['invalid IHDR CRC', (bytes: Uint8Array) => mutateChunkCrc(bytes, 'IHDR')],
    ['invalid IDAT CRC', (bytes: Uint8Array) => mutateChunkCrc(bytes, 'IDAT')],
    [
      'truncated chunk',
      (bytes: Uint8Array) => bytes.subarray(0, bytes.byteLength - 5),
    ],
    ['trailing bytes', (bytes: Uint8Array) => Uint8Array.from([...bytes, 0])],
  ])('rejects %s', (_name, mutate) => {
    expect(() =>
      validatePngEvidenceSequence([{ path: 'bad.png', bytes: mutate(png()) }])
    ).toThrow();
  });

  it('rejects duplicate/missing/misordered critical chunks and unsupported chunks', () => {
    const valid = png();
    const header = valid.subarray(8, 33);
    const idat = valid.subarray(33, valid.byteLength - 12);
    const end = valid.subarray(valid.byteLength - 12);
    for (const bytes of [
      png({ chunks: [header, header, idat, end] }),
      png({ chunks: [header, end] }),
      png({ chunks: [idat, header, end] }),
      png({
        chunks: [
          header,
          idat,
          chunk('tEXt', new TextEncoder().encode('x')),
          end,
        ],
      }),
      png({ chunks: [header, idat, chunk('IEND'), idat] }),
    ])
      expect(() => inspectPngEvidence(bytes, 'critical chunks')).toThrow();
  });

  it('rejects inflate failure, exact inflate-size mismatch, and unsupported filters', () => {
    const valid = png();
    const header = valid.subarray(8, 33);
    const end = valid.subarray(valid.byteLength - 12);
    const cases = [
      png({ chunks: [header, chunk('IDAT', Uint8Array.from([1, 2, 3])), end] }),
      png({
        chunks: [
          header,
          chunk('IDAT', deflateSync(Uint8Array.from([0, 1, 2]))),
          end,
        ],
      }),
      png({
        rows: Uint8Array.from([5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      }),
    ];
    for (const bytes of cases)
      expect(() => inspectPngEvidence(bytes, 'inflate/filter')).toThrow();
  });

  it('rejects illegal screenshot profiles, empty/unreadable pixels, and contrast escape', () => {
    const valid = png();
    const illegal = valid.slice();
    illegal[24] = 6;
    const repairedHeader = illegal.subarray(12, 29);
    new DataView(illegal.buffer).setUint32(29, crc32(repairedHeader));
    expect(() => preflightPngEvidence(illegal, 'illegal profile')).toThrow();
    expect(() =>
      inspectPngEvidence(png({ rows: new Uint8Array(14) }), 'uniform', {
        requireReadableContent: true,
      })
    ).toThrow();
    expect(() =>
      inspectPngEvidence(png(), 'region', {
        contrastRegion: { left: 1, top: 1, width: 2, height: 2 },
      })
    ).toThrow();
  });

  it('rejects per-image and aggregate declared resource excess before decode', () => {
    expect(() =>
      preflightPngEvidence(png(), 'single', { maxInflatedBytes: 13 })
    ).toThrow();
    let inspected = false;
    expect(() =>
      validatePngEvidenceSequence(
        [
          { path: 'first.png', bytes: png() },
          { path: 'second.png', bytes: png() },
        ],
        {
          maxAggregateDecodedBytes: 23,
          onInspected: () => {
            inspected = true;
          },
        }
      )
    ).toThrow();
    expect(inspected).toBe(false);
  });
});
