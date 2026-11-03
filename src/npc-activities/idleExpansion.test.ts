import {
  NPC_ACTIVITY_PROFILES,
  resolveNpcAppearance,
} from '@/generated/npcAppearanceCatalog';
import { describe, expect, it } from 'vitest';
import { npcActivityProfile, unsupportedNpcDefault } from './activityProfile';

const social = [
  ['shy', 'Idle_Shy'],
  ['slumped', 'Idle_Slumped'],
  ['dramatic', 'Idle_Dramatic'],
  ['drunken-sway', 'Idle_DrunkSway'],
  ['arms-folded-grumpy', 'Idle_FoldedGrumpy'],
  ['hands-on-hips-grumpy', 'Idle_HipsGrumpy'],
] as const;

describe('six additional published idles on unchanged human looks', () => {
  it.each(social)(
    'binds %s once per supported look with all three native phases',
    (name, clip) => {
      const ref = `dnd5e:activities:${name}`;
      const profiles = NPC_ACTIVITY_PROFILES.filter((p) => p.activities[ref]);
      expect(profiles).toHaveLength(1);
      const profile = profiles[0];
      expect(profile.appearances).toHaveLength(72);
      expect(profile.activities[ref]).toMatchObject({
        enter: `${clip}_Enter`,
        sustain: clip,
        exit: `${clip}_Exit`,
        moving: false,
        leaveAt: 'loop-boundary',
        entryPose: 'relaxed',
        exitPose: 'relaxed',
      });
      for (const phase of [`${clip}_Enter`, clip, `${clip}_Exit`])
        expect(profile.library.clips).toContain(phase);
      for (const body of profile.appearances) {
        expect(resolveNpcAppearance(body.assetRef)?.standingSha256).toBe(
          body.standingSha256
        );
        expect(npcActivityProfile({ appearanceRef: body.assetRef })).toBe(
          profile
        );
        expect(
          unsupportedNpcDefault({ profile, defaultActivityRef: ref })
        ).toBe(false);
      }
      expect(profile.activities['dnd5e:activities:thoughtful'].sustain).toBe(
        'Idle_Thoughtful'
      );
      expect(profile.defaultActivityRef).toBe('dnd5e:activities:relaxed');
      expect(
        unsupportedNpcDefault({
          profile,
          defaultActivityRef: profile.walkActivityRef,
        })
      ).toBe(true);
      expect(
        unsupportedNpcDefault({
          profile,
          defaultActivityRef: 'future:activity:missing',
        })
      ).toBe(true);
    }
  );
});
