import {
  NPC_ACTIVITY_PROFILES,
  NPC_APPEARANCE_CATALOG,
  resolveNpcAppearance,
} from '@/generated/npcAppearanceCatalog';
import { describe, expect, it } from 'vitest';
import { npcActivityProfile, unsupportedNpcDefault } from './activityProfile';

describe('the whole Kingdom rig uses the existing activity vocabulary', () => {
  it('binds every published 55-joint look without replacing goblin-camp support', () => {
    const profile = NPC_ACTIVITY_PROFILES.find(
      (p) => p.id === 'kingdom-human-idles-v1'
    );
    expect(profile).toBeDefined();
    const old = NPC_ACTIVITY_PROFILES.find(
      (p) => p.id === 'warcamp-human-idles-v1'
    )!;
    expect(old.appearances).toHaveLength(72);
    expect(profile!.jointCount).toBe(55);
    expect(profile!.appearances).toHaveLength(204);
    expect(new Set(profile!.appearances.map((body) => body.assetRef))).toEqual(
      new Set(
        NPC_APPEARANCE_CATALOG.filter((body) =>
          body.assetRef.startsWith('dnd5e:npcs:kingdom:')
        ).map((body) => body.assetRef)
      )
    );
    expect(profile!.library.sha256).toBe(
      'd06eb99087eb5c344d6befdd0632a92c4b42b6976e4ab6e863ba4e2ac52b37fc'
    );
    expect(profile!.activities).toEqual(old.activities);
    for (const body of profile!.appearances) {
      expect(resolveNpcAppearance(body.assetRef)?.standingSha256).toBe(
        body.standingSha256
      );
      expect(npcActivityProfile({ appearanceRef: body.assetRef })).toBe(
        profile
      );
      expect(old.appearances.some((b) => b.assetRef === body.assetRef)).toBe(
        false
      );
      for (const [ref, activity] of Object.entries(profile!.activities)) {
        expect(
          unsupportedNpcDefault({ profile, defaultActivityRef: ref })
        ).toBe(activity.moving);
        for (const clip of [activity.enter, activity.sustain, activity.exit]) {
          if (clip && !['Idle_Relaxed', 'Walk_Forward'].includes(clip))
            expect(profile!.library.clips).toContain(clip);
        }
      }
    }
    expect(
      npcActivityProfile({ appearanceRef: 'dnd5e:npcs:goblin:warrior-male-01' })
    ).toBeUndefined();
  });
});
