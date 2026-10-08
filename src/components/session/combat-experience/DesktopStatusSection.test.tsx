import { SESSION_COMBAT_FIXTURES } from '@/concepts/session-combat/fixtures';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DesktopStatusSection,
  type DesktopStatusSectionProps,
} from './DesktopStatusSection';

const character = SESSION_COMBAT_FIXTURES[0]!.characterData;
const props: DesktopStatusSectionProps = {
  hitPoints: character.hitPoints,
  hpPercent: 79,
  armor: character.armorClassDetail,
  movementLabel: 'Move',
  movementFeet: 25,
  movementStale: false,
  privateStatus: 'ready',
};

describe('DesktopStatusSection', () => {
  it('renders exact read-only HP, AC and movement without action/drag/page controls', () => {
    const view = render(<DesktopStatusSection {...props} />);
    expect(screen.getByText('22/28')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('25 ft')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(view.container.querySelector('[data-offer-id]')).toBeNull();
    expect(view.container.querySelector('[draggable]')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('preserves zero values and shows absent facts as unknown rather than zero', () => {
    const view = render(
      <DesktopStatusSection
        {...props}
        hitPoints={{ ...character.hitPoints!, current: 0 }}
        armor={{ ...character.armorClassDetail!, total: 0 }}
        movementFeet={0}
        hpPercent={0}
      />
    );
    expect(screen.getByText('0/28')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('0 ft')).toBeInTheDocument();
    view.rerender(
      <DesktopStatusSection
        {...props}
        hitPoints={undefined}
        armor={undefined}
        movementFeet={undefined}
      />
    );
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByText('0 ft')).not.toBeInTheDocument();
  });
  it('qualifies cached private and movement data and preserves the read retry', () => {
    const retry = vi.fn();
    render(
      <DesktopStatusSection
        {...props}
        privateStatus="stale"
        privateStatusMessage="Waiting for the owner view."
        movementStale
        onRetry={retry}
      />
    );
    expect(screen.getByText('22/28')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Private status may be out of date'
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Waiting for the owner view.'
    );
    expect(screen.getByText('Movement may be out of date')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry status' }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it.each(['loading', 'unavailable'] as const)(
    'keeps a visible status section while private data is %s',
    (privateStatus) => {
      render(
        <DesktopStatusSection
          {...props}
          hitPoints={undefined}
          armor={undefined}
          privateStatus={privateStatus}
        />
      );
      expect(screen.getByTestId('desktop-status-section')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        privateStatus === 'loading'
          ? 'Loading private status'
          : 'Private status unavailable'
      );
      expect(screen.getByText('25 ft')).toBeInTheDocument();
    }
  );
});
