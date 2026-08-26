import { HEX_SIZE } from '@/components/hex-grid/hexMath';
import type { DungeonShellProps } from '@/components/session/DungeonShell';
import {
  buildScene3D,
  resolveSceneLayout,
} from '@/components/session/atlasToScene3D';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureAtlasOf } from '../fixtures/fixtureAtlas';
import { referenceTombDoc } from '../fixtures/referenceTomb';
import { DungeonPreview3D } from './DungeonPreview3D';

const probe = vi.hoisted(() => ({
  shellProps: null as DungeonShellProps | null,
  lightMounts: 0,
}));

vi.mock('@/components/session/DungeonShell', () => ({
  DungeonShell: (props: DungeonShellProps) => {
    probe.shellProps = props;
    return <group data-testid="preview-shell" />;
  },
}));

vi.mock('@/components/session/DungeonSceneLights', () => ({
  DungeonSceneLights: () => {
    probe.lightMounts += 1;
    return <group data-testid="preview-lights" />;
  },
}));

vi.mock('@/components/hex-grid/HexEntity', () => ({
  HexEntity: () => null,
}));
vi.mock('@/components/hex-grid/PathPreview', () => ({
  PathPreview: () => null,
}));
vi.mock('@/components/session/AtlasPropModel', () => ({
  AtlasPropModel: () => null,
}));
vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
}));
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, ...props }: { children: React.ReactNode }) => (
    <div {...props}>{children}</div>
  ),
}));

const atlas = fixtureAtlasOf(referenceTombDoc());
const doc = referenceTombDoc();

beforeEach(() => {
  probe.shellProps = null;
  probe.lightMounts = 0;
});

describe('DungeonPreview3D rendered shell parity', () => {
  it('passes the game-built scene to one shell, omits game-only door props, and mounts lights once', () => {
    render(
      <DungeonPreview3D
        atlas={atlas as GetAtlasResponse}
        doc={doc}
        status="ready"
      />
    );

    const gate = resolveSceneLayout(atlas);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    const gameScene = buildScene3D(atlas, HEX_SIZE, gate.layout);
    expect(probe.shellProps?.scene).toEqual(gameScene);
    expect(probe.shellProps?.doors).toBeUndefined();
    expect(probe.shellProps?.onDoorClick).toBeUndefined();
    expect(screen.getByTestId('preview-shell')).toBeTruthy();
    expect(probe.lightMounts).toBe(1);
  });

  it('transitions the rendered legacy banner through the shell fallback callback', () => {
    render(
      <DungeonPreview3D
        atlas={atlas as GetAtlasResponse}
        doc={doc}
        status="ready"
      />
    );

    expect(screen.queryByTestId('preview-shell-fallback')).toBeNull();
    act(() => {
      probe.shellProps?.onFallbackReason?.('manifest-unavailable');
    });
    expect(screen.getByTestId('preview-shell-fallback').textContent).toBe(
      'Legacy shell: manifest-unavailable'
    );
    act(() => {
      probe.shellProps?.onFallbackReason?.(null);
    });
    expect(screen.queryByTestId('preview-shell-fallback')).toBeNull();
  });
});
