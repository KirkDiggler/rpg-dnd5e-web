import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorldBuilderInspector } from './WorldBuilderInspector';

function panels() {
  return (
    <>
      <details data-inspector-section="tables">
        <summary>Tables panel</summary>
        <input aria-label="Table name" defaultValue="watch" />
      </details>
      <section data-inspector-section="selection">
        <input aria-label="Selected name" defaultValue="guard" />
      </section>
    </>
  );
}

describe('World Builder inspector navigation', () => {
  it('tracks a root summary opened directly, not just navigation buttons', () => {
    render(
      <WorldBuilderInspector selectionKey="">{panels()}</WorldBuilderInspector>
    );
    const root = screen.getByText('Tables panel').closest('details')!;
    root.open = true;
    fireEvent(root, new Event('toggle'));
    expect(
      screen
        .getByRole('button', { name: 'Configure Tables' })
        .getAttribute('aria-pressed')
    ).toBe('true');
  });
  it('opens a root section and preserves edits while tucked away', () => {
    render(
      <WorldBuilderInspector selectionKey="">{panels()}</WorldBuilderInspector>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Configure Tables' }));
    expect(screen.getByLabelText('Table name').closest('details')?.open).toBe(
      true
    );
    fireEvent.change(screen.getByLabelText('Table name'), {
      target: { value: 'watch-drill' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }));
    expect(screen.queryByRole('textbox', { name: 'Table name' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Configure Tables' }));
    expect(
      (screen.getByLabelText('Table name') as HTMLInputElement).value
    ).toBe('watch-drill');
  });

  it('opens selection on a new selection, not every edit or render', () => {
    const view = render(
      <WorldBuilderInspector selectionKey="">{panels()}</WorldBuilderInspector>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }));
    view.rerender(
      <WorldBuilderInspector selectionKey="guard">
        {panels()}
      </WorldBuilderInspector>
    );
    expect(
      screen
        .getByRole('button', { name: 'Collapse inspector' })
        .getAttribute('aria-expanded')
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: 'Configure Selection' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }));
    view.rerender(
      <WorldBuilderInspector selectionKey="guard">
        {panels()}
      </WorldBuilderInspector>
    );
    expect(
      screen
        .getByRole('button', { name: 'Expand inspector' })
        .getAttribute('aria-expanded')
    ).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Expand inspector' }));
    expect(
      (screen.getByLabelText('Selected name') as HTMLInputElement).value
    ).toBe('guard');
  });
});
