import { resolveNpcAppearance } from '@/generated/npcAppearanceCatalog';

export type NpcAppearanceModelResolution =
  | { readonly kind: 'legacy' }
  | { readonly kind: 'unavailable'; readonly appearanceRef: string }
  | {
      readonly kind: 'resolved';
      readonly appearanceRef: string;
      readonly url: string;
      readonly forwardOffset: number;
    };

/** An explicit unknown appearance never falls through to a rules-derived model. */
export function resolveNpcAppearanceModel(input: {
  readonly appearanceRef?: string;
  readonly downed?: boolean;
}): NpcAppearanceModelResolution {
  if (input.appearanceRef === undefined || input.appearanceRef === '') {
    return { kind: 'legacy' };
  }
  const appearance = resolveNpcAppearance(input.appearanceRef);
  const offsets: Readonly<Record<string, number>> = {
    '+Z': 0,
    '-Z': Math.PI,
    '+X': -Math.PI / 2,
    '-X': Math.PI / 2,
  };
  const forwardOffset =
    appearance && Object.hasOwn(offsets, appearance.forwardAxis)
      ? offsets[appearance.forwardAxis]
      : undefined;
  return appearance && forwardOffset !== undefined
    ? {
        kind: 'resolved',
        appearanceRef: input.appearanceRef,
        url: input.downed ? appearance.downedUrl : appearance.standingUrl,
        forwardOffset,
      }
    : { kind: 'unavailable', appearanceRef: input.appearanceRef };
}
