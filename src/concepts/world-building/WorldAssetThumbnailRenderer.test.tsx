import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { GeneratedWorldBuildingCatalogEntry } from './catalog';

const captured = vi.hoisted(() => ({
  modelProps: [] as unknown[],
  rendererProps: [] as unknown[],
}));

vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: ({
    children,
    ...props
  }: {
    children: ReactNode;
    requestKey: string;
  }) => {
    captured.rendererProps.push(props);
    return <>{children}</>;
  },
}));

vi.mock('./WorldPropModel', () => ({
  WorldPropModel: (props: unknown) => {
    captured.modelProps.push(props);
    return null;
  },
}));

import { WorldAssetThumbnailRenderer } from './WorldAssetThumbnailRenderer';

const asset = GENERATED_WORLD_ASSETS['dnd5e:props:dark-fortress:bench_01']!;
const entry: GeneratedWorldBuildingCatalogEntry = {
  source: 'generated',
  ref: asset.ref,
  label: asset.displayName,
  category: asset.category,
  asset,
  supportsDecoration: asset.supportsDecoration,
};

describe('WorldAssetThumbnailRenderer', () => {
  it('renders the exact placed WorldPropModel leaf through the shared capture surface', () => {
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onRootError = vi.fn();
    render(
      <WorldAssetThumbnailRenderer
        entry={entry}
        requestKey="bench-key"
        onComplete={onComplete}
        onError={onError}
        onRootError={onRootError}
      />
    );

    expect(captured.rendererProps.at(-1)).toMatchObject({
      requestKey: 'bench-key',
      onComplete,
      onError,
      onRootError,
    });
    expect(captured.modelProps.at(-1)).toEqual({
      entry,
      position: [0, 0, 0],
      rotationY: 0,
    });
  });
});
