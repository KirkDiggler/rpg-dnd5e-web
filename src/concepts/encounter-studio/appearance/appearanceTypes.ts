import type { GeneratedWorldAsset } from '@/generated/worldAssetCatalog';
import type { NpcAppearanceFamily } from '@/npc-appearances/npcAppearanceChoices';
import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
import type { WorldSurfaceImage } from '@/rendering/worldMaterialTypes';
import type { StudioArrangeSelection } from '../../world-building/studioArrange';
import type { WorldScene } from '../../world-building/types';
import type { WallFinishSide } from '../../world-building/wallFinishTypes';
import type { ArrangeDraft } from '../StudioArrangeFields';

export interface AppearanceChoice {
  readonly value: string;
  readonly label: string;
}
interface ChoiceField {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly choices: readonly AppearanceChoice[];
  readonly unavailable?: string;
  /** Display-only mixed selection; never an authored value. */
  readonly mixed?: true;
}
export type AppearanceChannel = 'color' | 'normal' | 'emissive';
export type AppearanceChannelState =
  | { readonly kind: 'pack-map'; readonly image: WorldSurfaceImage }
  | { readonly kind: 'no-map' }
  | { readonly kind: 'complete-look' }
  | { readonly kind: 'unavailable'; readonly reason: string };
export type AppearanceField =
  | (ChoiceField & {
      readonly kind: 'npc-family' | 'npc-style' | 'npc-skin' | 'asset';
    })
  | (ChoiceField & { readonly kind: 'atlas-pack'; readonly surfaceId: string })
  | (ChoiceField & {
      readonly kind: 'wall-finish';
      readonly side: WallFinishSide | 'both';
    })
  | {
      readonly kind: 'channel';
      readonly id: string;
      readonly label: string;
      readonly target: string;
      readonly channel: AppearanceChannel;
      readonly state: AppearanceChannelState;
    };
export type AppearanceEdit =
  | {
      readonly kind: 'npc-family' | 'npc-style' | 'npc-skin' | 'asset';
      readonly value: string;
    }
  | {
      readonly kind: 'atlas-pack';
      readonly surfaceId: string;
      readonly value: string;
    }
  | {
      readonly kind: 'wall-finish';
      readonly side: WallFinishSide | 'both';
      readonly value: string;
    };

/** Derived editor data, never another saved document or resource authority. */
export interface AppearanceSheet {
  readonly selectionKey: string;
  readonly fields: readonly AppearanceField[];
  readonly diagnostics: readonly string[];
}
export interface AppearanceSheetInput {
  readonly selection: StudioArrangeSelection;
  readonly draft: ArrangeDraft;
  readonly scene: Readonly<WorldScene>;
  readonly catalog: WorldMaterialCatalog | null;
  readonly assets: Readonly<Record<string, GeneratedWorldAsset>>;
  readonly npcFamilies: readonly NpcAppearanceFamily[];
  /** Existing owner-supplied replacement choices; not a new asset browser. */
  readonly assetChoices?: readonly AppearanceChoice[];
}

/** Bind field edits to the existing owner's explicit selection revision. */
export function appearanceSelectionKey(
  selection: StudioArrangeSelection
): string {
  return JSON.stringify([selection.selectionKey, selection.selectionRevision]);
}
