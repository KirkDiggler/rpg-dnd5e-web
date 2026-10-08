import { create } from '@bufbuild/protobuf';
import {
  AbilityRefSchema,
  DeclarationSchema,
  SpellRefSchema,
  TargetCandidateSchema,
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapFirstTargeting } from './MapFirstTargeting';
import {
  toggleMemberTarget,
  type MemberTargetingInput,
} from './memberTargeting';
import { TargetSurface } from './TargetSurface';

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  cleanup();
  host.remove();
});
const names = new Map([
  ['a', 'Alpha'],
  ['b', 'Beta'],
  ['c', 'Gamma'],
]);
const offer = (name = 'Authored spell', verb = Verb.CAST) =>
  create(DeclarationSchema, {
    id: 'offer',
    verb,
    available: true,
    targetKind: TargetKind.MEMBER,
    minTargets: 1,
    maxTargets: 2,
    spell: create(SpellRefSchema, { name }),
    ability: create(AbilityRefSchema, { name }),
    candidates: ['a', 'b', 'c'].map((member) =>
      create(TargetCandidateSchema, { member, available: true })
    ),
  });
function Harness({
  declaration = offer(),
  onChoose = () => {},
  onConfirm = () => {},
  initialSelected = [],
  authorityFresh = true,
}: {
  declaration?: ReturnType<typeof offer>;
  onChoose?: (member: string) => void;
  onConfirm?: () => void;
  initialSelected?: readonly string[];
  authorityFresh?: boolean;
}) {
  const [selected, setSelected] = useState(initialSelected);
  const input: MemberTargetingInput = {
    declaration,
    selectedMembers: selected,
    authorityFresh,
    turnAllowed: true,
  };
  return (
    <TargetSurface
      phase="targeting"
      selection={null}
      isViewerTurn
      showTurnNotice={false}
      memberNames={names}
      location={{ name: 'Room', area: '' }}
      mapFirst={input}
      mapFirstHost={host}
      renderMap={({ attackableTargets, selectedTargets, onTargetClick }) => (
        <div
          data-testid="map"
          data-selected={selectedTargets?.join(',')}
          data-offered={attackableTargets.join(',')}
        >
          {['a', 'b', 'c', 'foreign'].map((member) => (
            <button
              key={member}
              type="button"
              onClick={() => onTargetClick(member)}
            >
              Map {member}
            </button>
          ))}
        </div>
      )}
      onTargetClick={(member) => {
        onChoose(member);
        setSelected(
          (current) =>
            toggleMemberTarget({ ...input, selectedMembers: current }, member)
              .members
        );
      }}
      onConfirmTargets={onConfirm}
      onCancelSelection={() => setSelected([])}
    />
  );
}

describe('map-first member targeting', () => {
  it('does not open a list/effects window automatically and keeps the map mounted', () => {
    render(<Harness />);
    expect(
      screen.getByRole('region', { name: 'Targeting' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Authored spell targets' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Choose a target')).not.toBeInTheDocument();
    const map = screen.getByTestId('map');
    fireEvent.click(screen.getByRole('button', { name: 'Targets (3)' }));
    expect(
      screen.getByRole('region', { name: 'Authored spell targets' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('map')).toBe(map);
  });
  it.each(['Bane', 'Bless', 'A new provider spell'])(
    'synchronizes map, list and chips for %s, and confirms only explicitly',
    (name) => {
      const confirm = vi.fn();
      const choose = vi.fn();
      render(
        <Harness
          declaration={offer(name)}
          onConfirm={confirm}
          onChoose={choose}
        />
      );
      expect(
        screen.getByRole('button', { name: `Cast ${name}` })
      ).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Map a' }));
      expect(
        screen.getByRole('button', { name: 'Remove Alpha' })
      ).toBeInTheDocument();
      expect(screen.getByTestId('map')).toHaveAttribute('data-selected', 'a');
      fireEvent.click(screen.getByRole('button', { name: 'Targets (3)' }));
      expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Beta' }));
      expect(screen.getByTestId('map')).toHaveAttribute('data-selected', 'a,b');
      expect(screen.getByRole('checkbox', { name: 'Gamma' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Map c' }));
      expect(choose).toHaveBeenCalledTimes(2);
      expect(confirm).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }));
      expect(screen.getByRole('checkbox', { name: 'Alpha' })).not.toBeChecked();
      expect(screen.getByTestId('map')).toHaveAttribute('data-selected', 'b');
      fireEvent.click(screen.getByRole('button', { name: `Cast ${name}` }));
      expect(confirm).toHaveBeenCalledOnce();
    }
  );
  it('presents a generic non-CAST multi-member confirmation and honors its supplied minimum', () => {
    const declaration = create(DeclarationSchema, {
      ...offer('Shared Ward', Verb.ACTIVATE),
      minTargets: 3,
      maxTargets: 3,
    });
    const confirm = vi.fn();
    render(<Harness declaration={declaration} onConfirm={confirm} />);
    for (const member of ['a', 'b'])
      fireEvent.click(screen.getByRole('button', { name: `Map ${member}` }));
    expect(
      screen.getByRole('button', { name: 'Confirm Shared Ward' })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Map c' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Shared Ward' })
    );
    expect(confirm).toHaveBeenCalledOnce();
  });
  it('keeps stale/withdrawn selections removable but cannot confirm or dispatch a foreign target', () => {
    const choose = vi.fn();
    const confirm = vi.fn();
    render(
      <Harness
        authorityFresh={false}
        initialSelected={['a', 'gone']}
        onChoose={choose}
        onConfirm={confirm}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Cast Authored spell' })
    ).toBeDisabled();
    expect(screen.getByTestId('map')).toHaveAttribute('data-offered', '');
    fireEvent.click(screen.getByRole('button', { name: 'Map foreign' }));
    expect(choose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Target 2' }));
    expect(
      screen.queryByRole('button', { name: 'Remove Target 2' })
    ).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });
  it('keeps prior picks visible and removable when the whole action is withdrawn', () => {
    const choose = vi.fn();
    render(
      <MapFirstTargeting
        input={{
          declaration: undefined,
          selectedMembers: ['a', 'b'],
          authorityFresh: true,
          turnAllowed: true,
        }}
        host={host}
        memberNames={names}
        onChoose={choose}
        onCancel={() => {}}
      />
    );
    expect(
      screen.getByText('This action is no longer available')
    ).toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }));
    expect(choose).toHaveBeenCalledWith('a');
    expect(
      screen.queryByRole('button', { name: /^Cast |^Confirm / })
    ).not.toBeInTheDocument();
  });

  it('keeps single-target callback behavior and makes details an explicit read-only operation', () => {
    const declaration = create(DeclarationSchema, {
      ...offer(),
      maxTargets: 1,
    });
    const choose = vi.fn();
    render(<Harness declaration={declaration} onChoose={choose} />);
    expect(
      screen.queryByRole('button', { name: 'Cast Authored spell' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Targets (3)' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect Alpha target' })
    );
    expect(
      screen.getByRole('region', { name: 'Alpha target information' })
    ).toBeInTheDocument();
    expect(choose).not.toHaveBeenCalled();
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Close information' }),
      { key: 'Escape' }
    );
    expect(
      screen.queryByRole('region', { name: 'Alpha target information' })
    ).not.toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'Authored spell targets' });
    fireEvent.click(within(list).getByRole('button', { name: /^Alpha/ }));
    expect(choose).toHaveBeenCalledWith('a');
  });
});
