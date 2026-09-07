// @vitest-environment node
import { execFile as execFileCallback } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { validateClassOutfitColorReceipt } from './captureClassOutfitColorEvidence.mjs';

const execFile = promisify(execFileCallback);
const scriptPath = fileURLToPath(
  new URL('./captureClassOutfitColorEvidence.mjs', import.meta.url)
);
const receiptPath = fileURLToPath(
  new URL(
    '../docs/evidence/912-class-outfit-colors/receipt.json',
    import.meta.url
  )
);

describe('class outfit color evidence receipt contract', () => {
  it('accepts an explicitly non-claiming pending receipt before the real game run', () => {
    expect(
      validateClassOutfitColorReceipt({
        issue: 912,
        status: 'pending-real-game-evidence',
      })
    ).toEqual({ status: 'pending' });
  });

  it('rejects a completed receipt that lacks normal-route screenshots and observations', () => {
    expect(() =>
      validateClassOutfitColorReceipt({
        status: 'captured',
        screenshots: [],
        observations: [],
        failures: 0,
      })
    ).toThrow(
      'Captured evidence requires real creation and session screenshots.'
    );
  });

  it('rejects a captured receipt when owner and roster outfit values differ', () => {
    expect(() =>
      validateClassOutfitColorReceipt({
        status: 'captured',
        screenshots: [{ path: 'creation.png' }, { path: 'session.png' }],
        observations: [
          {
            kind: 'owner-peer-customization-match',
            ownerOutfit: {
              primaryColorSrgb: 0,
              secondaryColorSrgb: 0x123456,
            },
            rosterOutfit: {
              primaryColorSrgb: 1,
              secondaryColorSrgb: 0x123456,
            },
          },
          { kind: 'movement-visible' },
          { kind: 'main-hand-witness' },
          { kind: 'off-hand-witness' },
          { kind: 'material-identity-stable' },
        ],
        verification: {
          httpOrApplicationFailures: 0,
          shaderOrProgramErrors: 0,
        },
        failures: 0,
      })
    ).toThrow('Owner Appearance and roster Customization must match exactly.');
  });

  it('rejects nonzero recorded application or shader failure counters', async () => {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    receipt.verification.shaderOrProgramErrors = 1;

    expect(() => validateClassOutfitColorReceipt(receipt)).toThrow(
      'Captured evidence must report zero HTTP/application and shader/program failures.'
    );
  });

  it('verifies the committed receipt and screenshot hashes through the CLI', async () => {
    const result = await execFile(process.execPath, [scriptPath, receiptPath]);

    expect(result.stdout).toBe('{"status":"captured"}\n');
    expect(result.stderr).toBe('');
  });

  it('rejects a committed screenshot whose bytes do not match its receipt hash', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'outfit-evidence-'));
    try {
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
      for (const screenshot of receipt.screenshots) {
        await copyFile(
          join(dirname(receiptPath), screenshot.path),
          join(directory, screenshot.path)
        );
      }
      receipt.screenshots[0].sha256 = '0'.repeat(64);
      const candidate = join(directory, 'receipt.json');
      await writeFile(candidate, JSON.stringify(receipt));

      await expect(
        execFile(process.execPath, [scriptPath, candidate])
      ).rejects.toMatchObject({
        stderr: expect.stringContaining('Screenshot SHA-256 mismatch'),
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects screenshot paths that escape the receipt directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'outfit-evidence-'));
    try {
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
      receipt.screenshots[0].path = '../outside.png';
      const candidate = join(directory, 'receipt.json');
      await writeFile(candidate, JSON.stringify(receipt));

      await expect(
        execFile(process.execPath, [scriptPath, candidate])
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          'Screenshot paths must stay within the receipt directory.'
        ),
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects fabricated observations hidden in a pending receipt', () => {
    expect(() =>
      validateClassOutfitColorReceipt({
        issue: 912,
        status: 'pending-real-game-evidence',
        observations: [{ kind: 'movement-visible' }],
      })
    ).toThrow('Pending evidence receipts cannot claim runtime observations.');
  });
});
