/**
 * EquipmentCategoryPicker concept (rpg-dnd5e-web#668 Phase 1, rpg-project#173
 * / ideas/equipment-enrichment/plan.md). Dev-only bench for the accessible
 * category picker, driven entirely by typed fixtures — see fixtures.ts for
 * why these are fixtures and not a client-side eligibility reconstruction.
 *
 * This concept is reachable only through the Concepts Lab
 * (`?concept=equipment-category-picker`, dev-mode gated in App.tsx) and is
 * NOT wired into the production equipment-choice flow
 * (EquipmentBundleChoice/EquipmentChoiceSelector still own that route,
 * unchanged, per Phase 1 scope).
 */

import { useState } from 'react';
import { EquipmentCategoryPicker } from '../../components/equipment/EquipmentCategoryPicker';
import { CATEGORY_CHOICE_FIXTURES } from './fixtures';

export function EquipmentCategoryPickerConcept() {
  const [selectionByFixture, setSelectionByFixture] = useState<
    Record<string, string[]>
  >({});
  const [isLoadingFixture, setIsLoadingFixture] = useState<string | null>(null);

  return (
    <div>
      <p
        className="text-sm mb-4"
        style={{ color: 'var(--text-secondary)', maxWidth: '72rem' }}
      >
        Equipment category picker concept (web#668 Phase 1, rpg-project#173).
        Fixture-only bench: every list below is typed, hand-authored
        `EquipmentItem[]` standing in for `EquipmentCategoryChoice.options` —
        the concrete, toolkit-resolved, enriched shape Phase 2 will put on the
        wire. This picker never decides eligibility; it only renders what
        it&apos;s handed and reports the selection. Not wired to any production
        route.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        {CATEGORY_CHOICE_FIXTURES.map((fixture) => (
          <div
            key={fixture.id}
            style={{
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <span
                style={{ fontSize: '12px', color: 'var(--text-secondary)' }}
              >
                fixture: {fixture.id}
              </span>
              <button
                onClick={() =>
                  setIsLoadingFixture((current) =>
                    current === fixture.id ? null : fixture.id
                  )
                }
                className="px-2 py-1 rounded text-xs"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                {isLoadingFixture === fixture.id
                  ? 'Simulating loading… (click to stop)'
                  : 'Simulate loading'}
              </button>
            </div>

            <EquipmentCategoryPicker
              label={fixture.label}
              chooseCount={fixture.chooseCount}
              options={fixture.options}
              isLoading={isLoadingFixture === fixture.id}
              selectedIds={selectionByFixture[fixture.id] ?? []}
              onChange={(selectedIds) =>
                setSelectionByFixture((all) => ({
                  ...all,
                  [fixture.id]: selectedIds,
                }))
              }
            />

            <div
              style={{
                marginTop: '10px',
                fontSize: '11px',
                fontFamily: 'monospace',
                color: 'var(--text-secondary)',
              }}
            >
              selected: [{(selectionByFixture[fixture.id] ?? []).join(', ')}]
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
