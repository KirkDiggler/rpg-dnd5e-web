/** Dimensions use rendered scene units, like the provider's boundsMeters.
 * The provider owns the part declaration; this planner never guesses a node.
 */
export type AssetHeightProfile =
  | { readonly mode: 'scale' }
  | { readonly mode: 'fixed' }
  | {
      readonly mode: 'anchored';
      readonly node: string;
      readonly capNode: string;
      readonly lowerAnchor: string;
      readonly upperAnchor: string;
      readonly lowerHeight: number;
      readonly upperHeight: number;
      readonly extension: 'repeat' | 'stretch';
    }
  | {
      readonly mode: 'repeat-above';
      readonly node: string;
      readonly baseHeight: number;
      readonly rowHeight: number;
      /** Optional fixed top, translated once rather than copied with the band. */
      readonly capNode?: string;
      readonly capHeight?: number;
    };

export interface AssetHeightLayoutInput {
  nativeHeight: number;
  targetHeight: number;
  profile: AssetHeightProfile;
  maxRows?: number;
}

export interface AssetHeightLayout {
  height: number;
  /** Whole-instance scale; fixed features stay at 1 for a repeated profile. */
  scaleY: number;
  /** Offsets from the authored repeat row, in rendered scene units. */
  rows: { offsetY: number; scaleY: number }[];
  capOffsetY?: number;
}

export const MAX_ASSET_HEIGHT_ROWS = 64;

function bandRows(
  remaining: number,
  rowHeight: number,
  maxRows: number,
  extension: 'repeat' | 'stretch' = 'repeat'
): AssetHeightLayout['rows'] {
  const count =
    remaining > 0
      ? extension === 'stretch'
        ? 1
        : Math.min(maxRows, Math.max(1, Math.round(remaining / rowHeight)))
      : 0;
  const scaleY = count > 0 ? remaining / count / rowHeight : 1;
  if (!Number.isFinite(scaleY) || scaleY <= 0)
    throw new Error('Asset height row scale is not representable.');
  return Array.from({ length: count }, (_, index) => ({
    offsetY: (remaining / count) * index,
    scaleY,
  }));
}

/** Pure layout. Attaching/removing clones belongs to the renderer's commit
 * lifecycle; cached geometry, material and texture objects are never modified.
 */
export function planAssetHeight({
  nativeHeight,
  targetHeight,
  profile,
  maxRows = MAX_ASSET_HEIGHT_ROWS,
}: AssetHeightLayoutInput): AssetHeightLayout {
  if (
    ![nativeHeight, targetHeight].every(
      (value) => Number.isFinite(value) && value > 0
    )
  )
    throw new Error('Asset height must be finite and positive.');
  if (!Number.isSafeInteger(maxRows) || maxRows < 1)
    throw new Error('Asset height row limit must be a positive integer.');

  switch (profile.mode) {
    case 'scale': {
      const scaleY = targetHeight / nativeHeight;
      if (!Number.isFinite(scaleY) || scaleY <= 0)
        throw new Error('Asset height scale is not representable.');
      return { height: targetHeight, scaleY, rows: [] };
    }
    case 'fixed':
      if (targetHeight !== nativeHeight)
        throw new Error(
          `Requested height differs from the fixed asset (${nativeHeight}); received ${targetHeight}.`
        );
      return { height: nativeHeight, scaleY: 1, rows: [] };
    case 'anchored': {
      const names = [
        profile.node,
        profile.capNode,
        profile.lowerAnchor,
        profile.upperAnchor,
      ];
      if (
        names.some((name) => typeof name !== 'string' || !name.trim()) ||
        new Set(names).size !== names.length ||
        ![profile.lowerHeight, profile.upperHeight].every(Number.isFinite) ||
        profile.lowerHeight < 0 ||
        profile.upperHeight <= profile.lowerHeight ||
        profile.upperHeight > nativeHeight ||
        !['repeat', 'stretch'].includes(profile.extension)
      )
        throw new Error(
          'Anchored height profile has invalid anchors or extension policy.'
        );
      if (targetHeight < nativeHeight)
        throw new Error(
          `Requested height is below the anchored native minimum (${nativeHeight}); received ${targetHeight}.`
        );
      const delta = targetHeight - nativeHeight;
      const span = profile.upperHeight - profile.lowerHeight;
      return {
        height: targetHeight,
        scaleY: 1,
        capOffsetY: delta,
        rows: bandRows(span + delta, span, maxRows, profile.extension),
      };
    }
    case 'repeat-above': {
      const { baseHeight, rowHeight, node } = profile;
      const hasCap =
        profile.capNode !== undefined || profile.capHeight !== undefined;
      const capHeight = profile.capHeight ?? 0;
      if (
        hasCap &&
        (typeof profile.capNode !== 'string' ||
          !profile.capNode.trim() ||
          profile.capNode === node ||
          !Number.isFinite(profile.capHeight) ||
          capHeight <= 0)
      )
        throw new Error(
          'Height profile requires a distinct cap and its positive height.'
        );
      if (
        !node.trim() ||
        !Number.isFinite(baseHeight) ||
        baseHeight < 0 ||
        !Number.isFinite(rowHeight) ||
        rowHeight <= 0 ||
        Math.abs(baseHeight + rowHeight + capHeight - nativeHeight) >
          1e-6 * Math.max(1, nativeHeight)
      )
        throw new Error('Repeat profile disagrees with the native height.');
      const minimumHeight = baseHeight + capHeight;
      if (targetHeight < minimumHeight)
        throw new Error(
          `Requested height is below the fixed region (${minimumHeight}); received ${targetHeight}.`
        );
      const remaining = targetHeight - minimumHeight;
      // Preserve the existing above-row policy: nearest whole courses, with
      // the residual shared by those courses, never by the opening below.
      // The pool limit bounds allocation, not the authored height. Spread
      // the residual over the rows actually created, never an uncapped count.
      const rows = bandRows(remaining, rowHeight, maxRows);
      return {
        height: targetHeight,
        scaleY: 1,
        ...(hasCap ? { capOffsetY: targetHeight - nativeHeight } : {}),
        rows,
      };
    }
    default:
      throw new Error('Unknown asset height profile.');
  }
}
