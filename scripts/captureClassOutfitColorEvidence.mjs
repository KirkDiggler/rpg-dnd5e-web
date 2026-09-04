import { readFile } from 'node:fs/promises';

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
  if (receipt.failures !== 0) {
    throw new Error(
      'Captured evidence must report zero HTTP/application failures.'
    );
  }
  return { status: 'captured' };
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const path = process.argv[2];
  if (!path)
    throw new Error(
      'Usage: node captureClassOutfitColorEvidence.mjs receipt.json'
    );
  const receipt = JSON.parse(await readFile(path, 'utf8'));
  process.stdout.write(
    `${JSON.stringify(validateClassOutfitColorReceipt(receipt))}\n`
  );
}
