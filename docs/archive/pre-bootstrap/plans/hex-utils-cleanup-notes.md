# Hex Utils Cleanup

## Dead Code in `src/utils/hexUtils.ts`

The following are unused and should be removed:

- `OffsetCoord` interface
- `cubeToOffset()` function
- `offsetToCube()` function

These are remnants from when offset conversion happened client-side. Now cube coords flow from toolkit → API → web with no conversion needed.

## Duplicate CubeCoord Definitions

Two places define `CubeCoord`:

- `src/utils/hexUtils.ts`
- `src/components/hex-grid/hexMath.ts`

Consider consolidating, or using proto `Position` type directly since it's already cube coords.

## What IS Needed

`cubeToWorld()` in `hexMath.ts` - converts cube hex address to Three.js world position for rendering. This is NOT offset conversion, it's "where does hex (2,-1,-1) sit in 3D space?"
