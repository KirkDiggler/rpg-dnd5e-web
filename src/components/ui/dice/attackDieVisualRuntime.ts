import {
  ACESFilmicToneMapping,
  SRGBColorSpace,
  type ColorSpace,
  type Texture,
  type ToneMapping,
} from 'three';
import type { AttackDieVisualConfig } from './attackDieVisualConfig';
export function resolveAttackDieRendererVisuals(
  config: Pick<
    AttackDieVisualConfig,
    'toneMapping' | 'outputColorSpace' | 'environment'
  >
): {
  toneMapping: ToneMapping;
  outputColorSpace: ColorSpace;
  environment: Texture | null;
} {
  if (config.toneMapping !== 'ACESFilmic')
    throw Error('unsupported attack die tone mapping');
  if (config.outputColorSpace !== 'sRGB')
    throw Error('unsupported attack die output color space');
  if (config.environment !== null)
    throw Error('attack die environment must be null');
  return {
    toneMapping: ACESFilmicToneMapping,
    outputColorSpace: SRGBColorSpace,
    environment: null,
  };
}
