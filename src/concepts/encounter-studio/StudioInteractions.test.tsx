/**
 * The hail distance form (rpg-project#923): one field per root interaction,
 * bounded 1 to Speak reach, empty meaning the interaction never hails.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { StudioInteractions } from './StudioInteractions';

/** The served castle authors `front-gate` with `approach: { within: 2 }`;
 * null takes the approach away, anything else replaces it. */
function castle(approach: string | null) {
  const authored = '    approach: { within: 2 }\n';
  if (!served.includes(authored)) throw new Error('the castle lost its hail');
  const text = served.replace(
    authored,
    approach === null ? '' : `    approach: ${approach}\n`
  );
  const read = readDraftYaml(text);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
}

function renderForm(approach: string | null) {
  const commitInteractionApproach = vi.fn(() => true);
  render(
    <StudioInteractions
      session={{ document: castle(approach), commitInteractionApproach }}
    />
  );
  const field = screen.getByLabelText(
    'Hails within (cells) for front-gate'
  ) as HTMLInputElement;
  return { field, commit: commitInteractionApproach };
}

function enter(field: HTMLInputElement, value: string) {
  fireEvent.change(field, { target: { value } });
  fireEvent.submit(field.closest('form')!);
}

describe('the hail distance field', () => {
  it('shows the authored distance on front-gate', () => {
    const { field } = renderForm('{ within: 2 }');
    expect(field.value).toBe('2');
  });

  it('shows empty when the interaction never hails', () => {
    const { field } = renderForm(null);
    expect(field.value).toBe('');
    expect(field.placeholder).toBe('never hails');
  });

  it('commits a distance inside Speak reach', () => {
    const { field, commit } = renderForm('{ within: 2 }');
    enter(field, '1');
    expect(commit).toHaveBeenCalledWith('front-gate', 1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['0', '4', '1.5'])('refuses %s and writes nothing', (value) => {
    const { field, commit } = renderForm('{ within: 2 }');
    enter(field, value);
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'A hail distance is a whole number of cells from 1 to 3 (Speak reach).'
    );
  });

  it('emptying the field removes the distance', () => {
    const { field, commit } = renderForm('{ within: 2 }');
    enter(field, '');
    expect(commit).toHaveBeenCalledWith('front-gate', null);
  });

  it('leaving the field applies it', () => {
    const { field, commit } = renderForm(null);
    fireEvent.change(field, { target: { value: '3' } });
    fireEvent.blur(field);
    expect(commit).toHaveBeenCalledWith('front-gate', 3);
  });
});
