import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import type { ArrangeDraft } from '../StudioArrangeFields';
import { channelAppearanceFixture } from './appearanceChannelTestFixtures';
import { appearanceEditPatch } from './appearanceEdits';
import { buildAppearanceSheet } from './appearanceSheet';
import type { AppearanceSheetInput } from './appearanceTypes';
import { StudioAppearancePanel } from './StudioAppearancePanel';

afterEach(cleanup);

function StagedPanel({ input }: { input: AppearanceSheetInput }) {
  const [draft, setDraft] = useState<ArrangeDraft>(input.draft);
  const current = { ...input, draft };
  const sheet = buildAppearanceSheet(current);
  return (
    <>
      <StudioAppearancePanel
        sheet={sheet}
        onChange={(edit) =>
          setDraft((previous) => ({
            ...previous,
            ...appearanceEditPatch({ ...current, sheet, edit }),
          }))
        }
      />
      <output data-testid="staged-channels">
        {JSON.stringify(draft.materialChannels ?? [])}
      </output>
    </>
  );
}

it('stages Default, explicit1, strength and Off in the existing shared panel', () => {
  const { document, input } = channelAppearanceFixture();
  const before = structuredClone(document);
  render(<StagedPanel input={input} />);
  const mode = screen.getByRole('combobox', { name: 'Body · Normal mode' });
  fireEvent.change(mode, { target: { value: 'scale' } });
  expect(screen.getByTestId('staged-channels').textContent).toContain(
    '"multiplier":1'
  );
  const strength = screen.getByRole('slider', {
    name: 'Body · Normal strength',
  });
  expect(strength.getAttribute('min')).toBe('0.5');
  expect(strength.getAttribute('max')).toBe('2');
  fireEvent.change(strength, { target: { value: '1.5' } });
  expect(screen.getByTestId('staged-channels').textContent).toContain(
    '"multiplier":1.5'
  );
  fireEvent.change(mode, { target: { value: 'off' } });
  expect(screen.getByTestId('staged-channels').textContent).toContain(
    '"mode":"off"'
  );
  fireEvent.change(mode, { target: { value: 'default' } });
  expect(screen.getByTestId('staged-channels').textContent).toBe('[]');
  expect(
    screen.queryByRole('combobox', { name: 'Body · Emissive mode' })
  ).toBeNull();
  expect(document).toEqual(before);
});

it('offers Off and relative intensity for a declared adjustable emissive source', () => {
  const { input, document } = channelAppearanceFixture('prop');
  const before = structuredClone(document);
  const catalog = input.catalog!;
  render(
    <StagedPanel
      input={{
        ...input,
        catalog: {
          ...catalog,
          channelBindings: catalog.channelBindings!.map((binding) => ({
            ...binding,
            targets: binding.targets.map((target) => ({
              ...target,
              emissive: {
                kind: 'adjustable' as const,
                minMultiplier: 0.5,
                maxMultiplier: 2,
              },
            })),
          })),
        },
      }}
    />
  );
  const mode = screen.getByRole('combobox', { name: 'Body · Emissive mode' });
  fireEvent.change(mode, { target: { value: 'off' } });
  expect(screen.getByTestId('staged-channels').textContent).toBe(
    '[{"targetId":"body","emissive":{"mode":"off"}}]'
  );
  fireEvent.change(mode, { target: { value: 'scale' } });
  fireEvent.change(
    screen.getByRole('slider', { name: 'Body · Emissive strength' }),
    { target: { value: '2' } }
  );
  expect(screen.getByTestId('staged-channels').textContent).toContain(
    '"multiplier":2'
  );
  expect(document).toEqual(before);
});

it('shows unavailable saved intent and allows an explicit reset without a catalog', () => {
  const { input } = channelAppearanceFixture();
  render(
    <StagedPanel
      input={{
        ...input,
        catalog: null,
        draft: {
          materialChannels: [{ targetId: 'lost', normal: { mode: 'off' } }],
        },
      }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reset lost · Normal' }));
  expect(screen.getByTestId('staged-channels').textContent).toBe('[]');
});
