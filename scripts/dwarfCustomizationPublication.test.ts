// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DWARF_CUSTOMIZATION_CATALOG } from '../src/generated/dwarfCustomizationCatalog';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const evidenceRoot = new URL(
  '../docs/evidence/883-dwarf-customization/',
  import.meta.url
);
const receiptUrl = new URL('receipt.json', evidenceRoot);
const screenshotUrl = new URL('kirk-game-close.png', evidenceRoot);
const catalogUrl = new URL(
  '../src/generated/dwarfCustomizationCatalog.ts',
  import.meta.url
);

interface Receipt {
  schemaVersion: number;
  authorities: {
    proto: { release: string; lockCommit: string };
    api: { requiredMerge: string; environmentHead: string };
    provider: { merge: string; manifestSha256: string };
    web: { implementationHead: string; catalogSha256: string };
  };
  humanVerdict: { quote: string; gameLoaded: boolean };
  normalGame: {
    route: string;
    raceRef: string;
    classRef: string;
    bodyUrl: string;
    scalp: { styleRef: string; mesh: string; bones: number };
    facialHair: { styleRef: string; mesh: string; bones: number };
    treatment: { baseColorSrgb: string; roughness: number; metalness: number };
    unexpectedFailures: number;
  };
  screenshot: {
    path: string;
    sha256: string;
    byteSize: number;
    dimensions: [number, number];
  };
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function receipt(): Receipt {
  expect(existsSync(receiptUrl)).toBe(true);
  return JSON.parse(readFileSync(receiptUrl, 'utf8')) as Receipt;
}

function publicFile(publicUrl: string): string {
  expect(publicUrl).toMatch(/^\/models\/synty\//);
  return fileURLToPath(new URL(`../public${publicUrl}`, import.meta.url));
}

describe('production Dwarf customization publication', () => {
  it('pins the exact merged provider, compatible proto, API authority, and implementation head', () => {
    const value = receipt();
    expect(value.schemaVersion).toBe(1);
    expect(value.authorities).toEqual({
      proto: {
        release: 'v0.1.152',
        lockCommit: 'f7af5d1abd8e9e3b81f880c8c0594f16a41b2024',
      },
      api: {
        requiredMerge: 'a795573fe160ca460f3a801d80220629dccd72d3',
        environmentHead: '54de1761deea4fa99264330cf842105bea23dcd6',
      },
      provider: {
        merge: '69a229aabe4a366039dd06a68148a8ff9e0ca4e8',
        manifestSha256:
          '10ba18b4281ea65b757d959ab7caa888adced2b106e2dc3b2e6ae0d19688ba4a',
      },
      web: {
        implementationHead: 'bb45804b1e2dcdfa53674e8e838c95c6e4a1e578',
        catalogSha256:
          '4bb16ef6b34964b514e10018e4e64e79b6bd016cfa8ff9e3d04eb35d1911ce45',
      },
    });
    expect(sha256(readFileSync(catalogUrl))).toBe(
      value.authorities.web.catalogSha256
    );
  });

  it('binds every generated body, fallback, style, and thumbnail to present ignored bytes', () => {
    const assets = [
      ...Object.values(DWARF_CUSTOMIZATION_CATALOG.bodies).flatMap((body) => [
        { url: body.url, sha256: body.sha256 },
        { url: body.fallbackUrl, sha256: body.fallbackSha256 },
      ]),
      ...DWARF_CUSTOMIZATION_CATALOG.slots.scalp.options.flatMap((style) => [
        { url: style.url, sha256: style.sha256 },
        { url: style.thumbnailUrl, sha256: style.thumbnailSha256 },
      ]),
      ...DWARF_CUSTOMIZATION_CATALOG.slots.facialHair.options.flatMap(
        (style) => [
          { url: style.url, sha256: style.sha256 },
          { url: style.thumbnailUrl, sha256: style.thumbnailSha256 },
        ]
      ),
    ];
    expect(assets).toHaveLength(120);
    for (const asset of assets) {
      const path = publicFile(asset.url);
      expect(existsSync(path), asset.url).toBe(true);
      expect(sha256(readFileSync(path)), asset.url).toBe(asset.sha256);
    }
    expect(
      execFileSync('git', ['ls-files', '--', 'public/models/synty'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      })
    ).toBe('');
    expect(() =>
      execFileSync(
        'git',
        ['check-ignore', '--quiet', '--', publicFile(assets[0]!.url)],
        { cwd: repositoryRoot }
      )
    ).not.toThrow();
  });

  it('records the exact human verdict and honest normal-game runtime readback', () => {
    const value = receipt();
    expect(value.humanVerdict).toEqual({
      quote: 'looks great, and loaded in game to verify it loads',
      gameLoaded: true,
    });
    expect(value.normalGame).toEqual({
      route:
        'creation -> draft reload -> finalization -> Reference Tomb session',
      raceRef: 'dwarf',
      classRef: 'monk',
      bodyUrl:
        '/models/synty/characters/customization/dwarf-v1/bodies/dwarf-monk-body.glb',
      scalp: {
        styleRef: 'modular-fantasy-hero:hair:07',
        mesh: 'Chr_Hair_07',
        bones: 63,
      },
      facialHair: {
        styleRef: 'modular-fantasy-hero:facial-hair:11',
        mesh: 'Chr_FacialHair_Male_11',
        bones: 63,
      },
      treatment: {
        baseColorSrgb: '#64A5CE',
        roughness: 0.72,
        metalness: 0,
      },
      unexpectedFailures: 0,
    });
  });

  it('binds the actual normal-game screenshot without machine-local paths', () => {
    const value = receipt();
    expect(value.screenshot.path).toBe('kirk-game-close.png');
    expect(existsSync(screenshotUrl)).toBe(true);
    const bytes = readFileSync(screenshotUrl);
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(value.screenshot).toEqual({
      path: 'kirk-game-close.png',
      sha256: sha256(bytes),
      byteSize: bytes.length,
      dimensions: [bytes.readUInt32BE(16), bytes.readUInt32BE(20)],
    });
    expect(JSON.stringify(value)).not.toMatch(/\/home\/|\/tmp\//);
  });
});
