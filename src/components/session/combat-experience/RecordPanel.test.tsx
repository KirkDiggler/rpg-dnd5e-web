import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RecordRow } from '../recordFeed';
import { RecordPanel } from './RecordPanel';

function row(
  id: string,
  beat: string,
  act: string,
  fields: Record<string, unknown> = { beat },
  at = 3n
): RecordRow {
  return { id, at, act, beat, fields };
}

const HERO = 'char_hero';

// rpg-dnd5e-web#1345: a reserve's dash (its pick, then the move act it
// drove: twelve steps and the opportunity attack they drew), the hero's
// turn ending, and the scene's opening beats, written outside any act.
const PICK = 'time:01HF7YAT10';
const RUN = 'move:01HF7YAT20';
const steps = Array.from({ length: 12 }, (_, i) =>
  row(
    `01HF7YAT2${String(i).padStart(2, '0')}`,
    'moved',
    RUN,
    { beat: 'moved', member: 'reserve-1', cause: 'encounter:table:dash' },
    1n
  )
);
const record: RecordRow[] = [
  row('01HF7YAT01', 'scene-opened', '', { beat: 'scene-opened' }, 0n),
  row('01HF7YAT02', 'sighted', '', { beat: 'sighted', member: HERO }, 0n),
  row(
    '01HF7YAT11',
    'answered',
    PICK,
    {
      beat: 'answered',
      creature: 'reserve-1',
      key: 'time',
      option: '',
      word: 'dash',
      selector: 'enemy',
      target: HERO,
      roll: 26,
      of: 100,
      entry: 0,
      temper: 'soldier',
      rows: [],
    },
    1n
  ),
  ...steps,
  row(
    '01HF7YAT3000',
    'struck',
    RUN,
    { beat: 'struck', actor: HERO, amount: 6, attack: { roll: 14, total: 19 } },
    1n
  ),
  row('01HF7YAT40', 'turn-ended', 'end_turn:01HF7YAT40', {
    beat: 'turn-ended',
    member: HERO,
  }),
];

/** The act rows shown, by key, top to bottom. */
function acts(): string[] {
  const list = screen.getByRole('list', { name: 'Record' });
  return Array.from(list.querySelectorAll(':scope > li')).map(
    (li) => li.getAttribute('data-act-key') ?? ''
  );
}

function line(key: string): HTMLElement {
  return screen.getByRole('button', { name: `Act ${key}` });
}

/** The beats an open act shows, by id, in order. */
function beatsOf(key: string): string[] {
  return within(screen.getByRole('list', { name: `Beats of ${key}` }))
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-record-id') ?? '');
}

describe('RecordPanel lists acts (rpg-dnd5e-web#1345)', () => {
  it('lists acts newest first, collapsed, with no page controls', () => {
    render(<RecordPanel feed={{ rows: record, notice: undefined }} />);
    expect(acts()).toEqual(['end_turn:01HF7YAT40', PICK, 'world:0']);
    for (const key of acts())
      expect(line(key).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Record rows per page')).toBe(null);
    expect(screen.queryByRole('button', { name: /record page/ })).toBe(null);
  });

  it('reads a dash act as who, the round, the word and what followed', () => {
    render(<RecordPanel feed={{ rows: record, notice: undefined }} />);
    expect(line(PICK).textContent).toBe(
      'reserve-1r1dash enemy12 cells, 1 strike'
    );
  });

  it('groups the pick and the beats it drove, oldest first, under one act', () => {
    render(<RecordPanel feed={{ rows: record, notice: undefined }} />);
    fireEvent.click(line(PICK));
    expect(beatsOf(PICK)).toEqual([
      '01HF7YAT11',
      ...steps.map((s) => s.id),
      '01HF7YAT3000',
    ]);
    const pick = screen.getByLabelText('The pick');
    expect(pick.textContent).toContain('reserve-1 · time · rolled 26 of 100');
    expect(pick.textContent).toContain(`target ${HERO}`);
  });

  it('puts beats with no act under a world row for their round', () => {
    render(<RecordPanel feed={{ rows: record, notice: undefined }} />);
    expect(line('world:0').textContent).toBe(
      'worldr01 scene-opened, 1 sighted'
    );
    fireEvent.click(line('world:0'));
    expect(beatsOf('world:0')).toEqual(['01HF7YAT01', '01HF7YAT02']);
  });

  it('a beat filter shows only the acts holding a match, opened', () => {
    render(<RecordPanel feed={{ rows: record, notice: undefined }} />);
    fireEvent.change(screen.getByLabelText('Filter by beat'), {
      target: { value: 'moved' },
    });
    expect(acts()).toEqual([PICK]);
    expect(line(PICK).getAttribute('aria-expanded')).toBe('true');
    const marked = within(
      screen.getByRole('list', { name: `Beats of ${PICK}` })
    )
      .getAllByRole('listitem')
      .filter((li) => li.getAttribute('data-match') === 'true')
      .map((li) => li.getAttribute('data-record-id'));
    expect(marked).toEqual(steps.map((s) => s.id));
    fireEvent.change(screen.getByLabelText('Filter by beat'), {
      target: { value: 'absent' },
    });
    expect(screen.getByText('No records match these filters.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(acts()).toHaveLength(3);
  });

  it("narrows to an act when a beat's act id is clicked", () => {
    render(<RecordPanel feed={{ rows: record, notice: undefined }} />);
    fireEvent.click(line('end_turn:01HF7YAT40'));
    fireEvent.click(
      screen.getByRole('button', { name: 'end_turn:01HF7YAT40' })
    );
    expect(acts()).toEqual(['end_turn:01HF7YAT40']);
    expect(screen.getByLabelText('Filter by act id')).toHaveProperty(
      'value',
      'end_turn:01HF7YAT40'
    );
  });

  it('puts a new act at the top and keeps every act after a restart', () => {
    const { rerender } = render(
      <RecordPanel feed={{ rows: record, notice: undefined }} />
    );
    const appended = [
      ...record,
      row('01HF7YAT50', 'moved', 'move:01HF7YAT50', {
        beat: 'moved',
        member: HERO,
      }),
    ];
    rerender(<RecordPanel feed={{ rows: appended, notice: undefined }} />);
    expect(acts()[0]).toBe('move:01HF7YAT50');
    rerender(<RecordPanel feed={{ rows: [], notice: 'Record restarted' }} />);
    expect(screen.getByText('No record beats received.')).toBeTruthy();
    rerender(<RecordPanel feed={{ rows: appended, notice: undefined }} />);
    expect(acts()).toHaveLength(4);
  });

  it('pretty-prints a beat’s fields', () => {
    render(<RecordPanel feed={{ rows: record, notice: undefined }} />);
    fireEvent.click(line(PICK));
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect struck 01HF7YAT3000' })
    );
    const pre = screen.getByLabelText('Record fields');
    expect(pre.textContent).toContain('\n  "attack": {\n    "roll": 14');
  });

  it('says when older beats aged out', () => {
    render(
      <RecordPanel
        feed={{ rows: record, notice: 'Older beats aged out of the record.' }}
      />
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Older beats aged out of the record.'
    );
  });
});

// rpg-project#674: gate-1's table, described once, then two answers that
// index it — the first picks the remembered chase, the second holds.
const GATE_TABLE = row('01HF7YAU01', 'table', 'time:01HF7YAU01X', {
  beat: 'table',
  creature: 'gate-1',
  option: '',
  key: 'time',
  temper: 'coward',
  percents: { attack: 50, toward: 50, away: 300, flee: 300, hold: 100 },
  rows: [
    {
      entry: 0,
      when: ['enemy seen'],
      word: 'attack',
      selector: 'enemy',
      weight: 1,
      say: '',
      fact: '',
      search: null,
    },
    {
      entry: 1,
      when: ['enemy remembered'],
      word: 'toward',
      selector: 'enemy',
      weight: 1,
      say: '',
      fact: '',
      search: null,
    },
    {
      entry: 2,
      when: ['enemy lost'],
      word: 'search',
      selector: '',
      weight: 1,
      say: '',
      fact: '',
      search: { distance: 6, heading: 'went' },
    },
  ],
});

function gateAnswer(
  id: string,
  roll: number,
  of: number,
  entry: number,
  rows: Record<string, unknown>[]
): RecordRow {
  return row(id, 'answered', `time:${id}X`, {
    beat: 'answered',
    creature: 'gate-1',
    prop: '',
    option: '',
    key: 'time',
    roll,
    of,
    entry,
    temper: 'coward',
    rows,
  });
}

const out = (entry: number, held: boolean, affordable: boolean) => ({
  entry,
  held,
  affordable,
  weight: 0,
  percent: 0,
  loaded: 0,
});

const chased = gateAnswer('01HF7YAU02', 36, 50, 1, [
  out(0, false, true),
  {
    entry: 1,
    held: true,
    affordable: true,
    weight: 1,
    percent: 50,
    loaded: 50,
  },
  out(2, false, false),
]);
const searched = gateAnswer('01HF7YAU03', 12, 50, 2, [
  out(0, false, true),
  out(1, false, true),
  {
    entry: 2,
    held: true,
    affordable: true,
    weight: 1,
    percent: 50,
    loaded: 50,
  },
]);

describe('RecordPanel reads a pick in its table’s words', () => {
  /** Open the pick's act and read its sentence and its rows. */
  function openPick(id: string) {
    fireEvent.click(line(`time:${id}X`));
    const pick = within(screen.getByLabelText('The pick'));
    return {
      sentence: pick.getAllByRole('paragraph')[0]!.textContent,
      lines: pick.queryAllByRole('listitem').map((li) => li.textContent ?? ''),
    };
  }

  it('reads the pick and the roll, and every row', () => {
    render(
      <RecordPanel
        feed={{ rows: [GATE_TABLE, chased, searched], notice: undefined }}
      />
    );
    const read = openPick('01HF7YAU02');
    expect(read.sentence).toBe(
      'gate-1 · time · rolled 36 of 50 · enemy remembered → toward enemy'
    );
    expect(read.lines).toEqual([
      '✗ enemy seen → attack enemy: condition',
      '✓ enemy remembered → toward enemy · 1 × coward 50% = 50',
      '✗ enemy lost → search 6 went: condition',
    ]);
    fireEvent.click(line('time:01HF7YAU02X'));
    expect(openPick('01HF7YAU03').sentence).toBe(
      'gate-1 · time · rolled 12 of 50 · enemy lost → search 6 went'
    );
  });

  it('finds the table under a beat filter that hides it', () => {
    render(
      <RecordPanel feed={{ rows: [GATE_TABLE, chased], notice: undefined }} />
    );
    fireEvent.change(screen.getByLabelText('Filter by beat'), {
      target: { value: 'answered' },
    });
    expect(acts()).toEqual(['time:01HF7YAU02X']);
    expect(
      within(screen.getByLabelText('The pick')).getByText(
        'gate-1 · time · rolled 36 of 50 · enemy remembered → toward enemy'
      )
    ).toBeTruthy();
  });

  it('reads by index and says so when no table was seen', () => {
    render(<RecordPanel feed={{ rows: [chased], notice: undefined }} />);
    const read = openPick('01HF7YAU02');
    expect(read.sentence).toBe(
      'gate-1 · time · rolled 36 of 50 · entry 1 · table not in record'
    );
    expect(read.lines).toEqual([
      '✗ entry 0: condition',
      '✓ entry 1 · 1 × coward 50% = 50',
      '✗ entry 2: condition',
    ]);
  });

  it('says unaffordable for a row whose condition held', () => {
    const swing = gateAnswer('01HF7YAU04', 1, 50, 1, [
      out(0, true, false),
      {
        entry: 1,
        held: true,
        affordable: true,
        weight: 1,
        percent: 50,
        loaded: 50,
      },
      out(2, false, false),
    ]);
    render(
      <RecordPanel feed={{ rows: [GATE_TABLE, swing], notice: undefined }} />
    );
    expect(openPick('01HF7YAU04').lines).toContain(
      '✗ enemy seen → attack enemy: unaffordable'
    );
  });
});
