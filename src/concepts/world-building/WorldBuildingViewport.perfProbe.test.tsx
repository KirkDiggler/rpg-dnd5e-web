import { DevPerfProbe } from '@/dev/DevPerfProbe';
import { cleanup, render } from '@testing-library/react';
import { Children, isValidElement, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyScene } from './sceneState';
import { WorldBuildingViewport } from './WorldBuildingViewport';

let latest: ReactNode;
vi.mock('@react-three/fiber', async (original) => {
  const actual = await original<typeof import('@react-three/fiber')>();
  // Capture the Canvas's children instead of a WebGL host: the question is
  // only whether the probe is mounted inside the studio 3D view's Canvas.
  return {
    ...actual,
    Canvas: ({ children }: { children: ReactNode }) => {
      latest = children;
      return null;
    },
  };
});
vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Html: () => null,
}));

const base = {
  scene: createEmptyScene('probe-test'),
  previewScene: null,
  selectedIds: [],
  tool: 'select' as const,
  activeDrag: null,
  onSelect: vi.fn(),
  onDrop: vi.fn(),
  onDragFinished: vi.fn(),
  onTransformPreview: vi.fn(),
  onTransformCommit: vi.fn(),
  onTransformReject: vi.fn(),
  onAssetState: vi.fn(),
};

const url = window.location.href;
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', url);
  vi.unstubAllEnvs();
});

function mountedProbe(): { windowMs?: number; label?: string } | null {
  render(<WorldBuildingViewport {...base} studioCanvas />);
  const probe = Children.toArray(latest).find(
    (child) => isValidElement(child) && child.type === DevPerfProbe
  );
  return probe && isValidElement(probe)
    ? (probe.props as { windowMs?: number; label?: string })
    : null;
}

it('mounts the perf probe in the studio 3D view under bench with ?perfProbe', () => {
  vi.stubEnv('MODE', 'bench');
  window.history.replaceState(
    null,
    '',
    '/?perfProbe&perfProbeMs=2000&perfProbeLabel=studio-keep'
  );
  expect(mountedProbe()).toEqual({ windowMs: 2000, label: 'studio-keep' });
});

it('does not mount the probe without ?perfProbe', () => {
  vi.stubEnv('MODE', 'bench');
  expect(mountedProbe()).toBeNull();
});

it('does not mount the probe in production even with ?perfProbe', () => {
  vi.stubEnv('MODE', 'production');
  window.history.replaceState(null, '', '/?perfProbe');
  expect(mountedProbe()).toBeNull();
});
