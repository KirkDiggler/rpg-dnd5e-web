// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_CUSTOMIZATION_CATALOG,
  CHARACTER_CUSTOMIZATION_PROVIDER,
} from '../src/generated/characterCustomizationCatalog';

const evidenceRoot = new URL(
  '../docs/evidence/897-all-race-hair/',
  import.meta.url
);
const receiptUrl = new URL('receipt.json', evidenceRoot);
const readmeUrl = new URL('README.md', evidenceRoot);

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

interface ScreenshotRecord {
  path: string;
  sha256: string;
  byteSize: number;
  dimensions: [number, number];
}

interface Receipt {
  schemaVersion: number;
  authorities: {
    provider: { merge: string; aggregateManifestSha256: string };
    web: {
      base: string;
      implementationHead: string;
      evidenceHead: string;
      ciCompatibilityHead: string;
      generatedCatalogSha256: string;
    };
  };
  humanVerdict: { reviewer: string; quote: string };
  creation: {
    route: string;
    raceRef: string;
    classRef: string;
    scalpStyleRef: string;
    facialHairStyleRef: string;
    colorSrgb: string;
    roughness: number;
    responseAuthoritativeApply: boolean;
    applicationFailures: number;
  };
  sessions: Array<{
    label: string;
    races: string[];
    bodyUrls: string[];
    accessoryUrls: string[];
    httpFailures: number;
    applicationFailures: number;
  }>;
  screenshots: ScreenshotRecord[];
}

function receipt(): Receipt {
  expect(existsSync(receiptUrl)).toBe(true);
  return JSON.parse(readFileSync(receiptUrl, 'utf8')) as Receipt;
}

describe('all-race customization browser evidence', () => {
  it('binds exact provider, integration base, generated catalog, and final verdict', () => {
    const value = receipt();
    expect(value.schemaVersion).toBe(1);
    expect(value.authorities.provider).toEqual({
      merge: CHARACTER_CUSTOMIZATION_PROVIDER.providerCommit,
      aggregateManifestSha256:
        CHARACTER_CUSTOMIZATION_PROVIDER.aggregateManifestSha256,
    });
    expect(value.authorities.web).toEqual({
      base: '822ce167a6a7d3f19030fc4432bf53be7f75950f',
      implementationHead: '598b746ee35813670411ea3c39d8310751268ba8',
      evidenceHead: '61e813cd4225911d201193956af5932ee057bd18',
      ciCompatibilityHead: '721b60bdd6068b5a56e768f3c1dde73f7c3304c9',
      generatedCatalogSha256:
        '6f56f8fb80575601a12fc5f9ff528c1ae9f1f12154cdfb9ed162c757dfdc10af',
    });
    expect(value.humanVerdict).toEqual({
      reviewer: 'Kirk',
      quote: 'it really does',
    });
  });

  it('records response-authoritative Human creation and exact persisted treatment', () => {
    expect(receipt().creation).toEqual({
      route: 'creation -> picker -> Apply -> draft summary -> finalization',
      raceRef: 'human',
      classRef: 'fighter',
      scalpStyleRef: 'modular-fantasy-hero:hair:38',
      facialHairStyleRef: 'modular-fantasy-hero:facial-hair:18',
      colorSrgb: '#64A5CE',
      roughness: 0.55,
      responseAuthoritativeApply: true,
      applicationFailures: 0,
    });
  });

  it('records two exact four-race normal sessions with profile-specific URLs', () => {
    const sessions = receipt().sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.races)).toEqual([
      ['human', 'elf', 'gnome', 'tiefling'],
      ['dwarf', 'half-elf', 'halfling', 'half-orc'],
    ]);
    expect(sessions.flatMap((session) => session.bodyUrls)).toHaveLength(8);
    expect(new Set(sessions.flatMap((session) => session.bodyUrls)).size).toBe(
      8
    );
    for (const session of sessions) {
      expect(session.bodyUrls).toHaveLength(4);
      expect(session.accessoryUrls.length).toBeGreaterThanOrEqual(4);
      expect(session.httpFailures).toBe(0);
      expect(session.applicationFailures).toBe(0);
      for (const url of [...session.bodyUrls, ...session.accessoryUrls]) {
        expect(url).toMatch(
          /^\/models\/synty\/characters\/customization\/[a-z-]+-v1\//
        );
      }
    }
    expect(CHARACTER_CUSTOMIZATION_CATALOG.profileOrder).toHaveLength(8);
  });

  it('hash-binds four readable PNGs and contains no machine-local paths', () => {
    const value = receipt();
    expect(existsSync(readmeUrl)).toBe(true);
    expect(value.screenshots).toHaveLength(4);
    for (const record of value.screenshots) {
      const url = new URL(record.path, evidenceRoot);
      expect(existsSync(url)).toBe(true);
      const bytes = readFileSync(url);
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(record).toEqual({
        path: record.path,
        sha256: sha256(bytes),
        byteSize: bytes.length,
        dimensions: [bytes.readUInt32BE(16), bytes.readUInt32BE(20)],
      });
    }
    const serialized =
      readFileSync(receiptUrl, 'utf8') + readFileSync(readmeUrl, 'utf8');
    expect(serialized).not.toMatch(/\/home\/|\/tmp\/|localhost:|3018/);
    expect(fileURLToPath(evidenceRoot)).not.toBe('');
  });
});
