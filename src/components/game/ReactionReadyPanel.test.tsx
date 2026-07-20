import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReactionReadyPanel } from './ReactionReadyPanel';

describe('ReactionReadyPanel', () => {
  it('renders both reaction rows as "unknown" when the readiness map has no entries', () => {
    render(
      <ReactionReadyPanel
        readiness={undefined}
        loading={false}
        disabled={false}
        onToggle={vi.fn()}
      />
    );
    const oa = screen.getByTestId(
      'reaction-toggle-dnd5e:conditions:opportunity_attack'
    );
    const shield = screen.getByTestId('reaction-toggle-dnd5e:spells:shield');
    expect(oa.textContent).toContain('unknown');
    expect(shield.textContent).toContain('unknown');
  });

  it('renders READY/unready per the readiness map verbatim', () => {
    const readiness = new Map<string, boolean>([
      ['dnd5e:conditions:opportunity_attack', true],
      ['dnd5e:spells:shield', false],
    ]);
    render(
      <ReactionReadyPanel
        readiness={readiness}
        loading={false}
        disabled={false}
        onToggle={vi.fn()}
      />
    );
    expect(
      screen.getByTestId('reaction-toggle-dnd5e:conditions:opportunity_attack')
        .textContent
    ).toContain('READY');
    expect(
      screen.getByTestId('reaction-toggle-dnd5e:spells:shield').textContent
    ).toContain('unready');
  });

  it('an UNKNOWN click calls onToggle with ready=true (the opt-in action)', () => {
    const onToggle = vi.fn();
    render(
      <ReactionReadyPanel
        readiness={undefined}
        loading={false}
        disabled={false}
        onToggle={onToggle}
      />
    );
    fireEvent.click(
      screen.getByTestId('reaction-toggle-dnd5e:conditions:opportunity_attack')
    );
    expect(onToggle).toHaveBeenCalledWith(
      { module: 'dnd5e', type: 'conditions', id: 'opportunity_attack' },
      true
    );
  });

  it('a READY click calls onToggle with ready=false (flips)', () => {
    const onToggle = vi.fn();
    const readiness = new Map<string, boolean>([['dnd5e:spells:shield', true]]);
    render(
      <ReactionReadyPanel
        readiness={readiness}
        loading={false}
        disabled={false}
        onToggle={onToggle}
      />
    );
    fireEvent.click(screen.getByTestId('reaction-toggle-dnd5e:spells:shield'));
    expect(onToggle).toHaveBeenCalledWith(
      { module: 'dnd5e', type: 'spells', id: 'shield' },
      false
    );
  });

  it('disables both toggles when disabled=true (encounter ended)', () => {
    render(
      <ReactionReadyPanel
        readiness={undefined}
        loading={false}
        disabled={true}
        onToggle={vi.fn()}
      />
    );
    const oa = screen.getByTestId(
      'reaction-toggle-dnd5e:conditions:opportunity_attack'
    ) as HTMLButtonElement;
    const shield = screen.getByTestId(
      'reaction-toggle-dnd5e:spells:shield'
    ) as HTMLButtonElement;
    expect(oa.disabled).toBe(true);
    expect(shield.disabled).toBe(true);
  });

  it('disables both toggles while a SetReactionReady RPC is in flight', () => {
    render(
      <ReactionReadyPanel
        readiness={undefined}
        loading={true}
        disabled={false}
        onToggle={vi.fn()}
      />
    );
    const oa = screen.getByTestId(
      'reaction-toggle-dnd5e:conditions:opportunity_attack'
    ) as HTMLButtonElement;
    expect(oa.disabled).toBe(true);
  });

  describe('compact mode (rpg-dnd5e-web#519)', () => {
    it('drops the "Ready reactions" header', () => {
      render(
        <ReactionReadyPanel
          readiness={undefined}
          loading={false}
          disabled={false}
          onToggle={vi.fn()}
          compact
        />
      );
      expect(screen.queryByText('Ready reactions')).toBeNull();
    });

    it('abbreviates visible text but keeps the full state in aria-label', () => {
      const readiness = new Map<string, boolean>([
        ['dnd5e:conditions:opportunity_attack', true],
      ]);
      render(
        <ReactionReadyPanel
          readiness={readiness}
          loading={false}
          disabled={false}
          onToggle={vi.fn()}
          compact
        />
      );
      const oa = screen.getByTestId(
        'reaction-toggle-dnd5e:conditions:opportunity_attack'
      );
      // Visible text is abbreviated ("OA" / "✓"), not the full words.
      expect(oa.textContent).not.toContain('READY');
      expect(oa.textContent).toContain('OA');
      // aria-label still carries the full, unabbreviated state.
      expect(oa.getAttribute('aria-label')).toContain(
        'Opportunity Attack: READY'
      );
    });
  });
});
