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
  /** A door item's live state: TRUE swings every declared group open. Absent
   * for a prop that is not a door, and for a door whose state the caller does
   * not hold — both render the asset's authored rest pose. */
  open?: boolean;
  /** Fires when a door item is clicked. The caller owns the affordance,
   * because it is the caller that knows who acts and what the door's state
   * is; this leaf only reports that the door was hit. */
  onDoorClick?: () => void;
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
  open,
  onDoorClick,
  onBoundsMeasured,
  onGeneratedDiagnostic,
}: WorldPropModelProps) {
  // `open`/`onDoorClick` reach the generated branch only: a door is a
  // promoted exact asset carrying `roles`, so a legacy variant has no named
  // leaf to swing and no door-ness to be clicked.
  return entry.source === 'generated' ? (
    <WorldAssetModel
      assetRef={entry.ref}
      position={position}
      rotationY={rotationY}
      heightScale={heightScale}
      open={open}
      onDoorClick={onDoorClick}
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
