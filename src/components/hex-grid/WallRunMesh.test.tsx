import type { ConnectorRun, EnvelopeRun } from '@/hooks/wallRuns';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { describe, expect, it } from 'vitest';
import { WallRunMesh } from './WallRunMesh';

describe('WallRunMesh R3F scene', () => {
  it('renders one box + one skirt per envelope run and per connector segment', async () => {
    const envelopeRuns: EnvelopeRun[] = [
      {
        regionId: 'hall',
        side: 'left',
        start: { x: 0, z: 0 },
        end: { x: 0, z: 4 },
      },
      {
        regionId: 'hall',
        side: 'right',
        start: { x: 4, z: 0 },
        end: { x: 4, z: 4 },
      },
    ];
    const connectorRuns: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'entrance',
        regionBId: 'hall',
        segments: [
          { start: { x: 6, z: 0 }, end: { x: 6, z: 1 } },
          { start: { x: 6, z: 3 }, end: { x: 6, z: 4 } },
        ],
        coveredRows: { minRow: 0, maxRow: 4 },
      },
    ];

    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh envelopeRuns={envelopeRuns} connectorRuns={connectorRuns} />
    );

    const meshes = renderer.scene.findAll((node) => node.type === 'Mesh');
    // 2 envelope runs + 2 connector segments = 4 groups, 2 meshes (wall +
    // skirt) each = 8 meshes total.
    expect(meshes).toHaveLength(8);
  });

  it('skips degenerate zero-length segments without throwing', async () => {
    const envelopeRuns: EnvelopeRun[] = [
      {
        regionId: 'r',
        side: 'left',
        start: { x: 1, z: 1 },
        end: { x: 1, z: 1 },
      },
    ];
    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh envelopeRuns={envelopeRuns} connectorRuns={[]} />
    );
    const meshes = renderer.scene.findAll((node) => node.type === 'Mesh');
    expect(meshes).toHaveLength(0);
  });

  it('renders nothing for empty runs', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh envelopeRuns={[]} connectorRuns={[]} />
    );
    const meshes = renderer.scene.findAll((node) => node.type === 'Mesh');
    expect(meshes).toHaveLength(0);
  });
});
