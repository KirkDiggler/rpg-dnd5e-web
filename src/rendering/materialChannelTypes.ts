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
