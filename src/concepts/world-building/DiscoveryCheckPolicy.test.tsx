import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiscoveryCheckPolicy } from './DiscoveryCheckPolicy';

describe('encounter-owned discovery policy', () => {
  it('does not advertise cross-playthrough memory or rewrite legacy input on render', () => {
    const onChange = vi.fn();
    render(
      <DiscoveryCheckPolicy
        id="secret"
        value={{ lifetime: 'character', max: 2 }}
        onChange={onChange}
      />
    );
    expect(
      screen.queryByRole('combobox', { name: /Attempt lifetime/ })
    ).toBeNull();
    expect(screen.getByText(/A new playthrough starts fresh/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Attempts for secret'), {
      target: { value: '3' },
    });
    expect(onChange).toHaveBeenCalledWith({ lifetime: 'run', max: 3 });
  });

  it('preserves the retry policy while authoring it for this run', () => {
    const onChange = vi.fn();
    render(
      <DiscoveryCheckPolicy
        id="secret"
        value={{ max: 2, reset_hexes: 4 }}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText('Retry distance for secret'), {
      target: { value: '5' },
    });
    expect(onChange).toHaveBeenCalledWith({
      max: 2,
      reset_hexes: 5,
      lifetime: 'run',
    });
  });
});
