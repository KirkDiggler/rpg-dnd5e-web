/** Dimensions use rendered scene units, like the provider's boundsMeters.
 * The provider owns the part declaration; this planner never guesses a node.
 */
export type AssetHeightProfile =
  | { readonly mode: 'scale' }
  | { readonly mode: 'fixed' }
  | {
      readonly mode: 'repeat-above';
      readonly node: string;
      readonly baseHeight: number;
      readonly rowHeight: number;
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
}

export const MAX_ASSET_HEIGHT_ROWS = 64;

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
        throw new Error('Requested height differs from the fixed asset.');
      return { height: nativeHeight, scaleY: 1, rows: [] };
    case 'repeat-above': {
      const { baseHeight, rowHeight, node } = profile;
      if (
        !node.trim() ||
        !Number.isFinite(baseHeight) ||
        baseHeight < 0 ||
        !Number.isFinite(rowHeight) ||
        rowHeight <= 0 ||
        Math.abs(baseHeight + rowHeight - nativeHeight) >
          1e-6 * Math.max(1, nativeHeight)
      )
        throw new Error('Repeat profile disagrees with the native height.');
      if (targetHeight < baseHeight)
        throw new Error('Requested height is below the fixed region.');
      const remaining = targetHeight - baseHeight;
      // Preserve the existing above-row policy: nearest whole courses, with
      // the residual shared by those courses, never by the opening below.
      const count =
        remaining > 0
          ? Math.min(maxRows, Math.max(1, Math.round(remaining / rowHeight)))
          : 0;
      // The pool limit bounds allocation, not the authored height. Spread
      // the residual over the rows actually created, never an uncapped count.
      const scaleY = count > 0 ? remaining / count / rowHeight : 1;
      if (!Number.isFinite(scaleY) || scaleY <= 0)
        throw new Error('Asset height row scale is not representable.');
      return {
        height: targetHeight,
        scaleY: 1,
        rows: Array.from({ length: count }, (_, index) => ({
          offsetY: (remaining / count) * index,
          scaleY,
        })),
      };
    }
    default:
      throw new Error('Unknown asset height profile.');
  }
}
