import { selectVisualVariant } from './selector';
import type {
  ResolvedVisualPlacement,
  Vec3,
  VisualAssetCatalog,
  VisualCalibrationEntry,
  VisualVariantSelection,
} from './types';

function finiteVec3(name: string, value: Vec3): void {
  if (
    value.length !== 3 ||
    value.some((component) => !Number.isFinite(component))
  ) {
    throw new TypeError(`${name} must contain exactly three finite values`);
  }
}

/**
 * Resolve P=T(p)T(o_world)R_y(facing), optionally followed by
 * C=T(-modelPoint)R_y(sourceForwardYawRad)S(totalScale).
 *
 * The returned array is column-major / Three.js-compatible. No React, R3F,
 * loader, camera, wall, gameplay or model-identity knowledge enters here.
 */
export function resolveVisualPlacement(
  entry: VisualCalibrationEntry | undefined,
  canonicalOrigin: Vec3,
  facingYaw: number,
  worldOffset?: Vec3
): ResolvedVisualPlacement {
  finiteVec3('canonicalOrigin', canonicalOrigin);
  if (worldOffset !== undefined) finiteVec3('worldOffset', worldOffset);
  if (!Number.isFinite(facingYaw)) {
    throw new TypeError('facingYaw must be finite');
  }

  const offset = worldOffset ?? [0, 0, 0];
  const baseX = canonicalOrigin[0] + offset[0];
  const baseY = canonicalOrigin[1] + offset[1];
  const baseZ = canonicalOrigin[2] + offset[2];

  if (!entry) {
    const c = Math.cos(facingYaw);
    const s = Math.sin(facingYaw);
    return {
      matrix: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, baseX, baseY, baseZ, 1],
      legacy: {
        position: [baseX, baseY, baseZ],
        rotationY: facingYaw,
        offsetTranslation: offset,
      },
      diagnostics: {
        offsetPresence: worldOffset === undefined ? 'omitted' : 'explicit',
        calibration: 'generic',
      },
    };
  }

  if (!Number.isFinite(entry.totalScale) || entry.totalScale <= 0) {
    throw new TypeError('totalScale must be finite and positive');
  }
  if (!Number.isFinite(entry.sourceForwardYawRad)) {
    throw new TypeError('sourceForwardYawRad must be finite');
  }
  if (entry.modelPoint)
    finiteVec3('modelPoint.position', entry.modelPoint.position);

  const combinedYaw = facingYaw + entry.sourceForwardYawRad;
  const c = Math.cos(combinedYaw) * entry.totalScale;
  const s = Math.sin(combinedYaw) * entry.totalScale;
  const point = entry.modelPoint?.position;
  const facingCos = Math.cos(facingYaw);
  const facingSin = Math.sin(facingYaw);
  const translatedX = point
    ? baseX - (facingCos * point[0] + facingSin * point[2])
    : baseX;
  const translatedY = point ? baseY - point[1] : baseY;
  const translatedZ = point
    ? baseZ - (-facingSin * point[0] + facingCos * point[2])
    : baseZ;

  return {
    matrix: [
      c,
      0,
      -s,
      0,
      0,
      entry.totalScale,
      0,
      0,
      s,
      0,
      c,
      0,
      translatedX,
      translatedY,
      translatedZ,
      1,
    ],
    legacy: {
      position: [baseX, baseY, baseZ],
      rotationY: facingYaw,
      offsetTranslation: offset,
    },
    diagnostics: {
      offsetPresence: worldOffset === undefined ? 'omitted' : 'explicit',
      calibration: point ? 'enrolled' : 'no-anchor',
      selectedVariantId: entry.id,
    },
  };
}

export interface CatalogVisualPlacement {
  selection: VisualVariantSelection;
  placement: ResolvedVisualPlacement;
}

/**
 * The single production selector/resolver entry point imported by Builder and
 * Game. Unknown/unenrolled families keep generic p+o behavior; enrolled
 * families append their catalog calibration. This function stays pure and has
 * no React, loader, camera, wall, gameplay, or model-identity knowledge.
 */
export function resolveCatalogVisualPlacement(
  catalog: VisualAssetCatalog,
  semanticRef: string,
  canonicalOrigin: Vec3,
  facingYaw: number,
  worldOffset?: Vec3
): CatalogVisualPlacement {
  const selection = selectVisualVariant(catalog, semanticRef);
  return {
    selection,
    placement: resolveVisualPlacement(
      selection.selected ? selection.entry : undefined,
      canonicalOrigin,
      facingYaw,
      worldOffset
    ),
  };
}
