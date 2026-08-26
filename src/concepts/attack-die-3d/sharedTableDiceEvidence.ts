import type { DiceRollGroupKey } from '../../components/ui/dice/diceRollGroup';

export interface SharedTableDiceEvidenceBridge {
  readonly revision: number;
  readonly presentationId: string;
  readonly groupKey: DiceRollGroupKey;
  readonly witnessRole: 'roller' | 'spectator';
  readonly rendererGeneration: number;
  readonly dieId: string;
  readonly projectedAnchor: readonly [number, number];
  readonly heldPoseApplied: boolean;
  readonly frameSequence: number;
}

export interface SharedTableDiceEvidenceMount {
  readonly presentationId: string;
  readonly groupKey: DiceRollGroupKey;
  readonly witnessRole: 'roller' | 'spectator';
  readonly rendererGeneration: number;
  readonly dieIds: readonly string[];
}

export interface SharedTableDiceEvidencePublisher {
  readonly activate: (mount: SharedTableDiceEvidenceMount) => void;
  readonly publish: (diagnostic: unknown) => boolean;
  readonly clear: () => void;
}

declare global {
  interface Window {
    __sharedTableDiceEvidence?: SharedTableDiceEvidenceBridge;
  }
}

interface ActiveFence {
  readonly presentationId: string;
  readonly groupKey: DiceRollGroupKey;
  readonly witnessRole: 'roller' | 'spectator';
  readonly rendererGeneration: number;
  readonly dieIds: ReadonlySet<string>;
}

let nextEvidenceRevision = 1;

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function groupKey(value: unknown): value is DiceRollGroupKey {
  return value === 'attack' || value === 'damage';
}

function witnessRole(value: unknown): value is 'roller' | 'spectator' {
  return value === 'roller' || value === 'spectator';
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function sameFence(first: ActiveFence, second: ActiveFence) {
  return (
    first.presentationId === second.presentationId &&
    first.groupKey === second.groupKey &&
    first.witnessRole === second.witnessRole &&
    first.rendererGeneration === second.rendererGeneration &&
    first.dieIds.size === second.dieIds.size &&
    [...first.dieIds].every((dieId) => second.dieIds.has(dieId))
  );
}

export function createSharedTableDiceEvidencePublisher(): SharedTableDiceEvidencePublisher {
  const fences = new Map<'roller' | 'spectator', ActiveFence>();
  const frameSequences = new Map<string, number>();
  let published: SharedTableDiceEvidenceBridge | undefined;

  return {
    activate: (mount) => {
      if (
        !identifier(mount.presentationId) ||
        !groupKey(mount.groupKey) ||
        !witnessRole(mount.witnessRole) ||
        !safeInteger(mount.rendererGeneration) ||
        mount.dieIds.length === 0 ||
        !mount.dieIds.every(identifier)
      )
        return;
      const fence: ActiveFence = Object.freeze({
        presentationId: mount.presentationId,
        groupKey: mount.groupKey,
        witnessRole: mount.witnessRole,
        rendererGeneration: mount.rendererGeneration,
        dieIds: new Set(mount.dieIds),
      });
      const current = fences.get(mount.witnessRole);
      if (current && sameFence(current, fence)) return;
      fences.set(mount.witnessRole, fence);
      for (const key of frameSequences.keys())
        if (key.startsWith(`${mount.witnessRole}:`)) frameSequences.delete(key);
    },
    publish: (value) => {
      try {
        if (value === null || typeof value !== 'object' || Array.isArray(value))
          return false;
        const diagnostic = value as Record<string, unknown>;
        if (
          !identifier(diagnostic.presentationId) ||
          !groupKey(diagnostic.groupKey) ||
          !witnessRole(diagnostic.witnessRole) ||
          !safeInteger(diagnostic.rendererGeneration) ||
          !identifier(diagnostic.dieId) ||
          !Array.isArray(diagnostic.projectedAnchor) ||
          diagnostic.projectedAnchor.length !== 2 ||
          !diagnostic.projectedAnchor.every(
            (coordinate) =>
              typeof coordinate === 'number' && Number.isFinite(coordinate)
          ) ||
          diagnostic.heldPoseApplied !== true ||
          !safeInteger(diagnostic.frameSequence) ||
          diagnostic.frameSequence < 1
        )
          return false;

        const fence = fences.get(diagnostic.witnessRole);
        if (
          !fence ||
          fence.presentationId !== diagnostic.presentationId ||
          fence.groupKey !== diagnostic.groupKey ||
          fence.rendererGeneration !== diagnostic.rendererGeneration ||
          !fence.dieIds.has(diagnostic.dieId)
        )
          return false;

        const frameKey = `${diagnostic.witnessRole}:${diagnostic.rendererGeneration}:${diagnostic.dieId}`;
        const previousFrame = frameSequences.get(frameKey) ?? 0;
        if (diagnostic.frameSequence <= previousFrame) return false;
        frameSequences.set(frameKey, diagnostic.frameSequence);

        const bridge: SharedTableDiceEvidenceBridge = Object.freeze({
          revision: nextEvidenceRevision++,
          presentationId: diagnostic.presentationId,
          groupKey: diagnostic.groupKey,
          witnessRole: diagnostic.witnessRole,
          rendererGeneration: diagnostic.rendererGeneration,
          dieId: diagnostic.dieId,
          projectedAnchor: Object.freeze([
            diagnostic.projectedAnchor[0],
            diagnostic.projectedAnchor[1],
          ] as [number, number]),
          heldPoseApplied: true,
          frameSequence: diagnostic.frameSequence,
        });
        published = bridge;
        window.__sharedTableDiceEvidence = bridge;
        return true;
      } catch {
        return false;
      }
    },
    clear: () => {
      fences.clear();
      frameSequences.clear();
      if (window.__sharedTableDiceEvidence === published)
        delete window.__sharedTableDiceEvidence;
      published = undefined;
    },
  };
}
