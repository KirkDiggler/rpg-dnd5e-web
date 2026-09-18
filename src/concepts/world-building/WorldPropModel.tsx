import {
  PropModel,
  type PropModelBounds,
} from '@/components/hex-grid/PropModel';
import {
  WorldAssetModel,
  type WorldAssetModelDiagnostic,
} from '@/components/hex-grid/WorldAssetModel';
import type { WorldBuildingCatalogEntry } from './catalog';

export interface WorldPropModelProps {
  entry: WorldBuildingCatalogEntry;
  position: [number, number, number];
  rotationY: number;
  heightScale?: number;
  onBoundsMeasured?: (bounds: PropModelBounds) => void;
  onGeneratedDiagnostic?: (diagnostic: WorldAssetModelDiagnostic) => void;
}

/**
 * The shared visual leaf for validated World Building catalog entries.
 * Callers retain ownership of lookup failure and loading/error presentation.
 */
export function WorldPropModel({
  entry,
  position,
  rotationY,
  heightScale = 1,
  onBoundsMeasured,
  onGeneratedDiagnostic,
}: WorldPropModelProps) {
  return entry.source === 'generated' ? (
    <WorldAssetModel
      assetRef={entry.ref}
      position={position}
      rotationY={rotationY}
      heightScale={heightScale}
      onDiagnostic={onGeneratedDiagnostic}
      onBoundsMeasured={onBoundsMeasured}
    />
  ) : (
    <PropModel
      variant={entry.variant}
      position={position}
      rotationY={rotationY}
      anchor="bounds-floor-center"
      heightScale={heightScale}
      onBoundsMeasured={onBoundsMeasured}
    />
  );
}
