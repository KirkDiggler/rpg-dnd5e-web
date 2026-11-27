/** Default is absence; an explicit multiplier of one remains authored intent. */
export type ChannelAdjustment =
  | { mode: 'off' }
  | { mode: 'scale'; multiplier: number };

/** Placement-owned adjustments for one provider-declared logical target.
 * Image choices, source paths and gameplay facts do not belong in this value. */
export interface MaterialChannelAdjustment {
  targetId: string;
  normal?: ChannelAdjustment;
  emissive?: ChannelAdjustment;
}

/** Provider-declared eligibility, not an inference from a loaded image.
 * Adjustable intervals are finite, positive and contain one. Consumers still
 * validate the effective look before applying an explicit adjustment. */
export type ChannelCapability =
  | { readonly kind: 'absent' }
  | { readonly kind: 'fixed' }
  | {
      readonly kind: 'adjustable';
      readonly minMultiplier: number;
      readonly maxMultiplier: number;
    };

/** One declared logical scope; selectors are specific to its representation. */
export interface MaterialChannelTarget {
  readonly id: string;
  readonly label: string;
  readonly selectors: readonly {
    readonly node: string;
    readonly material: string;
  }[];
  readonly normal: ChannelCapability;
  readonly emissive: ChannelCapability;
}

/** Verified provider metadata, not permission to guess a loaded model's scope. */
export interface MaterialChannelBinding {
  readonly assetRef: string;
  readonly representation: 'model' | 'standing' | 'downed';
  readonly glbSha256: string;
  readonly targets: readonly MaterialChannelTarget[];
}
