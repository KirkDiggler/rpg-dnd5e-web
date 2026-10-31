import { describe, expect, it } from 'vitest';
// @ts-expect-error Build-time JavaScript module.
import { parseNpcActivityProfile } from './npc-activity-profile.mjs';

const hash = 'a'.repeat(64);
const body = {
  assetRef: 'dnd5e:npcs:test:body',
  standingSha256: hash,
  jointCount: 50,
  animationClips: ['Idle', 'Walk'],
};
function fixture() {
  const relaxed = {
    label: 'Relaxed',
    entryPose: 'relaxed',
    exitPose: 'relaxed',
    enter: null,
    sustain: 'Idle',
    exit: null,
    leaveAt: 'any-time',
    moving: false,
  };
  return {
    schemaVersion: 1,
    id: 'test-v1',
    jointCount: 50,
    library: {
      file: 'npcs/activities/test/clips.glb',
      sha256: hash,
      clips: ['Enter', 'Thoughtful', 'Exit'],
    },
    defaultActivityRef: 'dnd5e:activities:relaxed',
    walkActivityRef: 'dnd5e:activities:walk',
    activities: {
      'dnd5e:activities:relaxed': relaxed,
      'dnd5e:activities:thoughtful': {
        ...relaxed,
        label: 'Thoughtful',
        enter: 'Enter',
        sustain: 'Thoughtful',
        exit: 'Exit',
        leaveAt: 'loop-boundary',
      },
      'dnd5e:activities:walk': {
        ...relaxed,
        label: 'Walking',
        entryPose: 'locomotion',
        exitPose: 'locomotion',
        sustain: 'Walk',
        moving: true,
      },
    },
    poseBridges: ['relaxed→locomotion', 'locomotion→relaxed'],
    appearances: [{ assetRef: body.assetRef, standingSha256: hash }],
  };
}

describe('hash-bound NPC activity profile', () => {
  it('keeps declared activities and exact body custody, converting only the runtime URL', () => {
    const value = fixture();
    const got = parseNpcActivityProfile({ value, appearances: [body] });
    expect(got.activities).toEqual(value.activities);
    expect(got.appearances).toEqual(value.appearances);
    expect(got.library.url).toBe(
      '/models/synty/npcs/activities/test/clips.glb'
    );
    expect(got.defaultActivityRef).toBe(value.defaultActivityRef);
  });
  it('refuses stale or unselected body identities rather than substituting support', () => {
    expect(() =>
      parseNpcActivityProfile({ value: fixture(), appearances: [] })
    ).toThrow(/appearance/);
    expect(() =>
      parseNpcActivityProfile({
        value: fixture(),
        appearances: [{ ...body, standingSha256: 'b'.repeat(64) }],
      })
    ).toThrow(/hash/);
  });
  it('refuses undeclared default, missing clips, missing pose bridges and ambiguous clip ownership', () => {
    const invalidDefault = fixture();
    invalidDefault.defaultActivityRef = 'dnd5e:activities:missing';
    expect(() =>
      parseNpcActivityProfile({ value: invalidDefault, appearances: [body] })
    ).toThrow(/default/);
    const missingClip = fixture();
    missingClip.library.clips = ['Thoughtful'];
    expect(() =>
      parseNpcActivityProfile({ value: missingClip, appearances: [body] })
    ).toThrow(/clip/);
    const noBridge = fixture();
    noBridge.poseBridges = [];
    expect(() =>
      parseNpcActivityProfile({ value: noBridge, appearances: [body] })
    ).toThrow(/bridge/);
    const duplicateClip = fixture();
    duplicateClip.library.clips.push('Idle');
    expect(() =>
      parseNpcActivityProfile({ value: duplicateClip, appearances: [body] })
    ).toThrow(/clip/);
  });
  it('refuses private/traversing library paths and malformed descriptors', () => {
    for (const file of [
      '/private/source.glb',
      'npcs/../secret.glb',
      'https://example.org/source.glb',
    ]) {
      const value = fixture();
      value.library.file = file;
      expect(() =>
        parseNpcActivityProfile({ value, appearances: [body] })
      ).toThrow(/path/);
    }
    const value = fixture();
    value.activities['dnd5e:activities:thoughtful'].leaveAt = 'sometimes';
    expect(() =>
      parseNpcActivityProfile({ value, appearances: [body] })
    ).toThrow(/boundary/);
  });
});
