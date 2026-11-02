import { expect, it } from 'vitest';
import { exportDraftYaml, readDraftYaml } from '../encounter-studio/draftFile';
import source from '../encounter-studio/fixtures/stack-sites/survivors-walk.yaml?raw';
import { setSiteFactionOption } from './sitePolicyEdits';

it('keeps a configured say cue through the actual Studio edit/export/reopen path without changing the room', () => {
  const opened = readDraftYaml(source);
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error(opened.refusal);
  const original = opened.scope.factions!.find((f) => f.id === 'band')!
    .options![0];
  const edited = setSiteFactionOption(opened.scope, 'band', 0, {
    ...original,
    success: [
      {
        say: 'Let me think.',
        activity: { ref: 'dnd5e:activities:thoughtful', cycles: 2 },
      },
    ],
  });
  const saved = exportDraftYaml(
    { draft: opened.draft, scope: edited },
    opened.key
  );
  const reopened = readDraftYaml(saved);
  expect(reopened.ok).toBe(true);
  if (!reopened.ok) throw new Error(reopened.refusal);
  expect(
    reopened.scope.factions!.find((f) => f.id === 'band')!.options![0].success
  ).toEqual([
    {
      say: 'Let me think.',
      activity: { ref: 'dnd5e:activities:thoughtful', cycles: 2 },
    },
  ]);
  expect(reopened.draft).toEqual(opened.draft);
  expect(original.success).toEqual([
    { say: 'We yield.', fact: 'band-yielded' },
  ]);
});
