/**
 * Inspector.test.tsx — the first render-layer test for the Inspector
 * (data layer already covered by `dungeonYaml.test.ts`'s "defaults:"
 * and fine-rotation sections; this is the "does the slider actually
 * gate on the right thing" half).
 *
 * Added while reconciling rpg-dnd5e-web#693 (fine rotation, generalized
 * to floor-standing props — the slider's disabled state is
 * `facing === null`) with #691 (`defaults:` ref-keyed inheritance — a
 * facing can now be non-null without being explicit on the placement).
 * Neither PR's own branch had both features at once, so neither has a
 * test proving an INHERITED facing enables the slider the same way an
 * explicit one does.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Inspector } from './Inspector';
import { parseDungeon, setRefDefault, toDungeonDoc } from './dungeonYaml';
import { SHOWCASE_YAML } from './fixtures';

function noop() {
  return vi.fn();
}

function renderInspector(
  doc: ReturnType<typeof parseDungeon>['doc'],
  overrides = {}
) {
  const props = {
    doc,
    selected: null,
    onSetFlags: noop(),
    onClearFlag: noop(),
    onDelete: noop(),
    onSetMount: noop(),
    onSetHeight: noop(),
    onSetTargeting: noop(),
    onSetFacing: noop(),
    onSetRotationDegrees: noop(),
    onSnapFlush: noop(),
    onFlipMountSide: noop(),
    ...overrides,
  };
  return render(<Inspector {...props} />);
}

describe('Inspector — fine-rotation slider gate composed with resolved (inherited) facing', () => {
  it('an INHERITED facing (defaults:, nothing explicit on the placement) enables the fine-rotation slider, same as an explicit one would', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    // showcase.yaml's own statue-reaper (shrine room) carries no
    // explicit facing at all — give its ref a default instead.
    setRefDefault(cst, 'dnd5e:props:statue-reaper', 'facing', 2); // NE
    const doc = toDungeonDoc(cst);
    const room = doc.rooms.find((r) => r.id === 'shrine')!;
    const statueIndex = room.place.findIndex(
      (p) => p.ref === 'dnd5e:props:statue-reaper'
    );
    expect(room.place[statueIndex]!.facing).toBeNull();
    expect(room.place[statueIndex]!.explicit.facing).toBe(false);

    const { container, getByText } = renderInspector(doc, {
      selected: { roomId: 'shrine', index: statueIndex },
    });

    const slider = container.querySelector<HTMLInputElement>(
      '#db-rotation-degrees'
    );
    expect(slider).not.toBeNull();
    // The whole point: `facing === null` is the disabled condition, and
    // an inherited facing is NOT null — resolvePlacement supplied it.
    expect(slider!.disabled).toBe(false);
    // And the facing control itself shows the "inherited" tag, not a
    // silently-blank facing — the same resolved value driving both.
    expect(getByText('inherited')).toBeTruthy();
  });

  it('NO facing at all (neither explicit nor a ref default) leaves the slider disabled, with the honest hint', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    const room = doc.rooms.find((r) => r.id === 'shrine')!;
    const statueIndex = room.place.findIndex(
      (p) => p.ref === 'dnd5e:props:statue-reaper'
    );

    const { container, getByText } = renderInspector(doc, {
      selected: { roomId: 'shrine', index: statueIndex },
    });

    const slider = container.querySelector<HTMLInputElement>(
      '#db-rotation-degrees'
    );
    expect(slider!.disabled).toBe(true);
    expect(
      getByText(
        'pick a facing direction above to enable fine rotation — there is no base angle to nudge yet'
      )
    ).toBeTruthy();
  });
});
