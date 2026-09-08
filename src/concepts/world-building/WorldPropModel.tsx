import {
  PropModel,
  type PropModelBounds,
} from '@/components/hex-grid/PropModel';
import { WorldAssetModel } from '@/components/hex-grid/WorldAssetModel';
import type { WorldAssetResolutionDiagnostic } from '@/generated/worldAssetCatalog';
import type { WorldBuildingCatalogEntry } from './catalog';

export interface WorldPropModelProps {
  entry: WorldBuildingCatalogEntry;
  position: [number, number, number];
  rotationY: number;
  onBoundsMeasured?: (bounds: PropModelBounds) => void;
  onGeneratedDiagnostic?: (diagnostic: WorldAssetResolutionDiagnostic) => void;
}

/**
 * The shared visual leaf for validated World Building catalog entries.
 * Callers retain ownership of lookup failure and loading/error presentation.
 */
export function WorldPropModel({
  entry,
  position,
  rotationY,
  onBoundsMeasured,
  onGeneratedDiagnostic,
}: WorldPropModelProps) {
  return entry.source === 'generated' ? (
    <WorldAssetModel
      assetRef={entry.ref}
      position={position}
      rotationY={rotationY}
      onDiagnostic={onGeneratedDiagnostic}
      onBoundsMeasured={onBoundsMeasured}
    />
  ) : (
    <PropModel
      variant={entry.variant}
      position={position}
      rotationY={rotationY}
      anchor="bounds-floor-center"
      onBoundsMeasured={onBoundsMeasured}
    />
  );
}
