import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { documentPlacementNames } from '../world-building/placementNames';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import { StudioScenarios } from './StudioScenarios';

afterEach(cleanup);

describe('StudioScenarios (rpg-project#578)', () => {
  it("a scenario binding reads with the bound placement's name", () => {
    const document = createPopulatedStudioDocument();
    render(<StudioScenarios document={document} />);
    const bindings = within(
      screen.getByRole('list', { name: 'Bindings of studio-scenario' })
    )
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    const name = documentPlacementNames(document).get('goblin-1');
    expect(name).toBeTruthy();
    expect(name).not.toBe('goblin-1');
    expect(bindings).toEqual(['exit → exit studio-exit', `guard → ${name}`]);
  });

  it('scenarios render no inputs', () => {
    const { container } = render(
      <StudioScenarios document={createPopulatedStudioDocument()} />
    );
    expect(container.querySelectorAll('input, select, textarea')).toHaveLength(
      0
    );
    expect(
      within(screen.getByRole('region', { name: 'Scenarios' })).queryByRole(
        'button',
        { name: /edit|add|remove/i }
      )
    ).toBeNull();
  });

  it('None when the document has no scenarios', () => {
    const document = createPopulatedStudioDocument();
    delete document.scope.scenarios;
    render(<StudioScenarios document={document} />);
    expect(screen.getByText('None.')).toBeTruthy();
  });
});
