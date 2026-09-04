import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const REQUIRED_OBSERVATIONS = Object.freeze([
  'owner-peer-customization-match',
  'movement-visible',
  'main-hand-witness',
  'off-hand-witness',
  'material-identity-stable',
]);

/**
 * Validates a controller-captured receipt. Pending receipts intentionally make
 * no runtime claim; completed receipts must carry real screenshots and the
 * normal-route observations required by #912.
 */
export function validateClassOutfitColorReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new TypeError('Evidence receipt must be an object.');
  }
  if (receipt.status === 'pending-real-game-evidence') {
    if (receipt.screenshots || receipt.observations) {
      throw new Error(
        'Pending evidence receipts cannot claim runtime observations.'
      );
    }
    if (receipt.issue !== 912)
      throw new Error('Pending receipt must identify issue #912.');
    return { status: 'pending' };
  }
  if (receipt.status !== 'captured') {
    throw new Error(
      'Evidence receipt status must be pending-real-game-evidence or captured.'
    );
  }
  if (!Array.isArray(receipt.screenshots) || receipt.screenshots.length < 2) {
    throw new Error(
      'Captured evidence requires real creation and session screenshots.'
    );
  }
  if (!Array.isArray(receipt.observations)) {
    throw new Error('Captured evidence requires normal-route observations.');
  }
  const observationKinds = new Set(
    receipt.observations.map((observation) => observation?.kind)
  );
  for (const kind of REQUIRED_OBSERVATIONS) {
    if (!observationKinds.has(kind)) {
      throw new Error(`Captured evidence is missing ${kind}.`);
    }
  }
  const ownerPeer = receipt.observations.find(
    (observation) => observation?.kind === 'owner-peer-customization-match'
  );
  const ownerOutfit = ownerPeer?.ownerOutfit;
  const rosterOutfit = ownerPeer?.rosterOutfit;
  if (
    !ownerOutfit ||
    !rosterOutfit ||
    ownerOutfit.primaryColorSrgb !== rosterOutfit.primaryColorSrgb ||
    ownerOutfit.secondaryColorSrgb !== rosterOutfit.secondaryColorSrgb
  ) {
    throw new Error(
      'Owner Appearance and roster Customization must match exactly.'
    );
  }
  if (
    receipt.verification?.httpOrApplicationFailures !== 0 ||
    receipt.verification?.shaderOrProgramErrors !== 0
  ) {
    throw new Error(
      'Captured evidence must report zero HTTP/application and shader/program failures.'
    );
  }
  if (receipt.failures !== 0) {
    throw new Error(
      'Captured evidence must report zero HTTP/application failures.'
    );
  }
  return { status: 'captured' };
}

function pathEscapesDirectory(directory, candidate) {
  const path = relative(directory, candidate);
  return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path);
}

/** Validates the committed files named by a structurally valid receipt. */
export async function validateClassOutfitColorReceiptFiles(
  receipt,
  receiptPath
) {
  const result = validateClassOutfitColorReceipt(receipt);
  if (result.status === 'pending') return result;

  const directory = dirname(resolve(receiptPath));
  for (const screenshot of receipt.screenshots) {
    if (
      !screenshot ||
      typeof screenshot.path !== 'string' ||
      screenshot.path.length === 0 ||
      isAbsolute(screenshot.path)
    ) {
      throw new Error(
        'Screenshot paths must stay within the receipt directory.'
      );
    }
    const path = resolve(directory, screenshot.path);
    if (pathEscapesDirectory(directory, path)) {
      throw new Error(
        'Screenshot paths must stay within the receipt directory.'
      );
    }
    if (!/^[0-9a-f]{64}$/u.test(screenshot.sha256)) {
      throw new Error(`Screenshot SHA-256 is invalid: ${screenshot.path}.`);
    }
    const bytes = await readFile(path);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== screenshot.sha256) {
      throw new Error(`Screenshot SHA-256 mismatch: ${screenshot.path}.`);
    }
  }
  return result;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const path = process.argv[2];
  if (!path)
    throw new Error(
      'Usage: node captureClassOutfitColorEvidence.mjs receipt.json'
    );
  const receipt = JSON.parse(await readFile(path, 'utf8'));
  process.stdout.write(
    `${JSON.stringify(
      await validateClassOutfitColorReceiptFiles(receipt, path)
    )}\n`
  );
}
