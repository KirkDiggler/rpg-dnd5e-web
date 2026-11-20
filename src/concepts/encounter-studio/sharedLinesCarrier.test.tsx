/**
 * A carrier's `- use: <conversation>` among its lines (rpg-project#1025,
 * #1027): the file loads and writes back byte for byte, the inspector's line
 * list shows the entry as the conversation's lines with the way to
 * Conversations (never a blank or broken line), and an edit to the
 * carrier's own line beside it keeps the `use:` as written.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { linesOf } from '../world-building/answerTableShape';
import { setMonsterOption } from '../world-building/monsterOrderEdits';
import { patchOption } from '../world-building/optionEdits';
import { SharedLinesContext } from '../world-building/sharedLinesContext';
import { OptionsEditor } from '../world-building/SitePolicies';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import site from './fixtures/conversations-site.yaml?raw';
import { placeName } from './placeName';
import { targetOfPath } from './refusalJump';
import { keyOfPath } from './revealKey';

afterEach(cleanup);

function read() {
  const result = readDraftYaml(site);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

describe('a carrier’s `use:` of a conversation', () => {
  it('loads and writes back byte for byte', () => {
    const result = read();
    expect(exportDraftYaml(result, result.key)).toBe(site);
    expect(result.draft.room.monsterBindings!['gate-1']!.options).toEqual([
      { use: 'gate-claims' },
    ]);
  });

  it('the inspector’s line list shows it as the conversation’s lines, with the way there', () => {
    const result = read();
    const open = vi.fn();
    const options = result.draft.room.monsterBindings!.captain!.options!;
    render(
      <SharedLinesContext.Provider
        value={{
          lineCount: (id) => (id === 'gate-claims' ? 3 : undefined),
          open,
        }}
      >
        <OptionsEditor
          owner="captain"
          at="room.room.monsterBindings.captain"
          options={options}
          room={result.draft.room}
          isProp={false}
          onAdd={vi.fn()}
          onChange={vi.fn()}
          onRemove={vi.fn()}
        />
      </SharedLinesContext.Provider>
    );
    const use = screen.getByTestId('option-use-captain-gate-claims');
    expect(use.textContent).toContain('Lines of gate-claims (3)');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open the lines of gate-claims in Conversations',
      })
    );
    expect(open).toHaveBeenCalledWith('gate-claims');
    // His own line is still the line form, beside it.
    expect(
      (screen.getByLabelText('Line 1 for captain') as HTMLTextAreaElement).value
    ).toBe('We’re invited guests of His Majesty, here for the feast.');
    // The use is not drawn as a line: no second line's words field.
    expect(screen.queryByLabelText('Line 2 for captain')).toBeNull();
  });

  it('removing it from the inspector removes that entry', () => {
    const result = read();
    const onRemove = vi.fn();
    render(
      <OptionsEditor
        owner="captain"
        at="room.room.monsterBindings.captain"
        options={result.draft.room.monsterBindings!.captain!.options!}
        room={result.draft.room}
        isProp={false}
        onAdd={vi.fn()}
        onChange={vi.fn()}
        onRemove={onRemove}
      />
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Stop captain saying the lines of gate-claims',
      })
    );
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('an edit to the captain’s own line keeps his `use:` as written', () => {
    const result = read();
    const draft = structuredClone(result.draft);
    const captain = draft.room.monsterBindings!.captain!;
    const guest = linesOf(captain.options!.slice(0, 1))[0]!;
    draft.room.monsterBindings!.captain = setMonsterOption(
      captain,
      0,
      patchOption(guest, { say: 'Guests here for the feast.' })
    )!;
    expect(draft.room.monsterBindings!.captain!.options![1]).toStrictEqual({
      use: 'gate-claims',
    });
    const saved = exportDraftYaml({ draft, scope: result.scope }, result.key);
    const left = site.split('\n');
    expect(saved.split('\n').filter((line, i) => line !== left[i])).toEqual([
      '            say: Guests here for the feast.',
    ]);
  });

  it('a path inside a conversation is named in words and lands on the page', () => {
    const result = read();
    expect(placeName('conversations.gate-claims.lines[0].check', result)).toBe(
      'the lines of `gate-claims` · line `troupe` · check'
    );
    expect(
      placeName('room.room.monsterBindings.gate-1.options[0]', result)
    ).toBe('gate-1 · the lines of `gate-claims`');
    expect(targetOfPath('conversations.gate-claims.lines[0]', result)).toEqual({
      kind: 'home',
      section: 'interactions',
    });
    expect(keyOfPath('conversations.gate-claims', result)).toEqual({
      kind: 'shared-lines',
      id: 'gate-claims',
    });
  });
});
