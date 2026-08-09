import { selectVisualVariant } from './selector';
import type { Vec3, VisualAssetCatalog, VisualCalibrationEntry } from './types';

export interface ReplaceablePlacement {
  semanticRef: string;
  canonicalOrigin: Vec3;
  facingYaw: number;
  offset?: Vec3;
}

export type OffsetEditDecision =
  | { action: 'retain' }
  | { action: 'change'; offset: Vec3 }
  | { action: 'remove' };

export type ReplacementResult =
  | {
      accepted: true;
      candidate: ReplaceablePlacement;
      entry: VisualCalibrationEntry;
    }
  | {
      accepted: false;
      prior: ReplaceablePlacement;
      reason: string;
    };

/**
 * V1 ref replacement is an atomic complete-document candidate. Offset policy
 * must be explicit; intrinsic facts always reload from the target default.
 */
export function buildReplacementCandidate(
  catalog: VisualAssetCatalog,
  prior: ReplaceablePlacement,
  targetSemanticRef: string,
  offsetDecision: OffsetEditDecision
): ReplacementResult {
  const selection = selectVisualVariant(catalog, targetSemanticRef);
  if (!selection.selected) {
    return { accepted: false, prior, reason: selection.reason };
  }
  const offset =
    offsetDecision.action === 'retain'
      ? prior.offset
      : offsetDecision.action === 'change'
        ? offsetDecision.offset
        : undefined;
  if (offset?.some((component) => !Number.isFinite(component))) {
    return { accepted: false, prior, reason: 'invalid-offset' };
  }
  return {
    accepted: true,
    candidate: {
      semanticRef: targetSemanticRef,
      canonicalOrigin: prior.canonicalOrigin,
      facingYaw: prior.facingYaw,
      ...(offset === undefined ? {} : { offset }),
    },
    entry: selection.entry,
  };
}
