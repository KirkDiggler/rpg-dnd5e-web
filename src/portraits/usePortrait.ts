import { createContext, useContext } from 'react';

export type PortraitResult =
  | { readonly status: 'loading'; readonly key: string }
  | { readonly status: 'ready'; readonly key: string; readonly image: string }
  | { readonly status: 'unavailable'; readonly message: string }
  | {
      readonly status: 'error';
      readonly key: string;
      readonly message: string;
    };

export const PortraitContext = createContext<ReadonlyMap<
  string,
  PortraitResult
> | null>(null);
export const missingPortrait = {
  status: 'unavailable',
  message: 'No unambiguous appearance was supplied for this member.',
} as const satisfies PortraitResult;

/** Supplies an ordinary image URL on success, never a previous appearance's image. */
export function usePortrait(memberId: string): PortraitResult {
  const portraits = useContext(PortraitContext);
  if (!portraits) throw new Error('usePortrait requires a PortraitProvider.');
  return portraits.get(memberId) ?? missingPortrait;
}
