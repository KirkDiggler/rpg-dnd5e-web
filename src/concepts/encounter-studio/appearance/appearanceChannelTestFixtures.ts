import type { MaterialChannelBinding } from '@/rendering/materialChannelTypes';
import { appearanceFixture } from './appearanceTestFixtures';
import type { AppearanceSheetInput } from './appearanceTypes';

/** Synthetic capability declarations exercise UI contracts on real owner
 * projections. They are not evidence that these published assets are enrolled. */
export function channelAppearanceFixture(
  kind: 'wall' | 'prop' | 'npc' = 'wall'
) {
  const fixture = appearanceFixture(
    kind === 'wall'
      ? { kind: 'wall', id: 'studio-wall' }
      : kind === 'prop'
        ? { kind: 'scene', ids: ['studio-decoration'] }
        : { kind: 'actor', id: 'goblin-1' }
  );
  const input: AppearanceSheetInput = fixture.input;
  const assetRef =
    input.selection.kind === 'actor'
      ? input.selection.monster.appearanceRef!
      : input.selection.kind === 'wall'
        ? input.selection.appearance.assetRef
        : input.scene.items.find((item) => item.id === 'studio-decoration')!
            .assetRef;
  const surface = input.catalog!.atlas?.bindings.find(
    (binding) => binding.assetRef === assetRef
  )?.surfaces[0];
  const targets: MaterialChannelBinding['targets'] = [
    {
      id: 'body',
      label: 'Body',
      selectors: [
        {
          node: surface?.node ?? 'ProofBody',
          material: surface?.material ?? 'ProofMaterial',
        },
      ],
      normal: { kind: 'adjustable', minMultiplier: 0.5, maxMultiplier: 2 },
      emissive: { kind: 'fixed' },
    },
  ];
  let channelBindings: MaterialChannelBinding[];
  if (kind === 'npc') {
    const look = input.npcFamilies
      .flatMap((family) => family.looks)
      .find((look) => look.assetRef === assetRef)!;
    channelBindings = [
      {
        assetRef,
        representation: 'standing',
        glbSha256: look.standingSha256,
        targets,
      },
      {
        assetRef,
        representation: 'downed',
        glbSha256: look.downedSha256,
        targets,
      },
    ];
  } else
    channelBindings = [
      {
        assetRef,
        representation: 'model',
        glbSha256: input.assets[assetRef].glbSha256,
        targets,
      },
    ];
  return {
    ...fixture,
    input: {
      ...input,
      catalog: { ...input.catalog!, channelBindings },
    } satisfies AppearanceSheetInput,
  };
}
