import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpeechLine } from './EntitySpeech';

describe('a creature’s line as speech (rpg-project#842)', () => {
  it('shows the line itself, named for a screen reader, with no button or tooltip', () => {
    render(
      <SpeechLine
        entityId="gate-1"
        name="Gate Guard"
        line="Whoa there, buddy. Can I help you?"
      />
    );
    const line = screen.getByLabelText(
      'Gate Guard says: Whoa there, buddy. Can I help you?'
    );
    expect(line).toHaveTextContent('Whoa there, buddy. Can I help you?');
    expect(line).toHaveAttribute('data-entity-speech', 'gate-1');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
