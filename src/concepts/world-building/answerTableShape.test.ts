import { describe, expect, it } from 'vitest';
import { validateAnswerTable } from './answerTableShape';

/** A refusal is asserted through the same path a document takes, so the
 * sentence an author meets is the one pinned here. */
const table = (on: unknown) => () => validateAnswerTable(on, 'on');

describe('answer table shape', () => {
  it('carries the shipped grammar verbatim', () => {
    const authored = {
      intimidated: [
        { weight: 70, say: 'Fine!', fact: 'goblin-cowed' },
        { weight: 30, flee: {} },
      ],
      intimidate_failed: [{ say: 'Big talk for someone in my doorway.' }],
      persuaded: [{ say: 'All right, the cellar is yours.' }],
      persuade_failed: [{ say: 'Nice try.' }],
      time: [
        { when: { enemy: 'reach' }, attack: 'enemy' },
        { when: { attacked: { within: 3 } }, attack: 'attacker', weight: 3 },
        { when: { enemy: 'none' }, toward: { at: [3, 4] } },
        { hold: {} },
        { when: { fled: { within: 3 } }, away: 'actor', weight: 5 },
        { when: { enemy: 'remembered' }, toward: 'enemy' },
        { when: { intimidated: { within: 1 } }, toward: 'actor' },
      ],
    };
    expect(validateAnswerTable(authored, 'on')).toEqual(authored);
  });

  it('refuses an unknown trigger and an unknown entry key, with a suggestion', () => {
    expect(table({ taunted: [{ say: 'hi' }] })).toThrow(
      /"taunted" is not a trigger this build rolls: they are intimidated/
    );
    expect(table({ intimidate: [{ say: 'hi' }] })).toThrow(
      /did you mean "intimidated"\?/
    );
    expect(table({ intimidated: [{ fcat: 'x', say: 'hi' }] })).toThrow(
      /did you mean "fact"\?/
    );
    expect(table({ intimidated: [{ temper: 'coward' }] })).toThrow(
      /unknown key "temper"/
    );
  });

  it('refuses an empty trigger list and an entry that does nothing', () => {
    expect(table({ time: [] })).toThrow(
      /this names a trigger and lists nothing that happens on it/
    );
    expect(table({ time: [{}] })).toThrow(
      /this entry does nothing and says nothing/
    );
  });

  it('refuses a word under a trigger it is not legal on, in the engine sentences', () => {
    expect(table({ intimidated: [{ attack: 'enemy' }] })).toThrow(
      /`attack` is what a creature does with time, and `intimidated` is an outcome/
    );
    expect(table({ time: [{ fact: 'x' }] })).toThrow(
      /`fact` answers a social verdict, and `time` is not one/
    );
    expect(
      table({ intimidated: [{ when: { enemy: 'reach' }, flee: {} }] })
    ).toThrow(
      /`intimidated` is already the condition — a `when` under it asks when a thing that just happened happened/
    );
  });

  it('refuses more than one word, a zero weight and an empty fact', () => {
    expect(table({ intimidated: [{ fact: 'x', flee: {} }] })).toThrow(
      /an entry does one thing/
    );
    expect(table({ intimidated: [{ weight: 0, say: 'hi' }] })).toThrow(
      /a weight of 0 can never be rolled/
    );
    expect(table({ intimidated: [{ fact: '' }] })).toThrow(
      /this says the world learns something and does not say what/
    );
  });

  it('refuses a malformed when and a selector the engine cannot resolve', () => {
    expect(table({ time: [{ when: { enemy: 'near' }, hold: {} }] })).toThrow(
      /`enemy: near` is not a condition this build reads/
    );
    expect(
      table({ time: [{ when: { enemy: 'reach', seen: 'x' }, hold: {} }] })
    ).toThrow(/a `when` is one condition, and this names 2/);
    expect(table({ time: [{ when: { fled: {} }, hold: {} }] })).toThrow(
      /`fled` names no span/
    );
    expect(
      table({ time: [{ when: { fled: { within: 0 } }, hold: {} }] })
    ).toThrow(/a span of 0 rounds is counted from 1/);
    expect(table({ time: [{ toward: 'nobody' }] })).toThrow(
      /"nobody" is not a selector this build resolves/
    );
    expect(table({ time: [{ attack: { at: [1, 2] } }] })).toThrow(
      /a cell is somewhere to walk toward, and `attack` acts on a creature/
    );
    expect(table({ time: [{ attack: 'actor' }] })).toThrow(
      /`actor` is the actor of the deed this entry's `when` names/
    );
    expect(
      table({ time: [{ away: 'actor', when: { attacked: { within: 2 } } }] })
    ).not.toThrow();
  });

  /**
   * A `when` ON A DEED MAY NAME A SCOPE (rpg-dnd5e-web#1199). `on: ally` reads
   * a deed against the creature's own side, `as: actor` reads one it did; the
   * scope REFINES the deed rather than adding a second condition, so a `when`
   * still names exactly one thing.
   *
   * The sentences are `dungeonspec.WhenSpec`'s own (`scopeOf`), so an author
   * meets the same words from the form and from the server.
   */
  it('carries a deed scope verbatim, and refuses a scope it does not read', () => {
    const authored = {
      time: [
        { when: { attacked: { within: 3, on: 'ally' } }, attack: 'enemy' },
        { when: { fled: { within: 2, as: 'actor' } }, hold: {} },
      ],
    };
    expect(validateAnswerTable(authored, 'on')).toEqual(authored);

    // Both spellings at once: two different questions, refused rather than
    // silently preferring one.
    expect(
      table({
        time: [{ when: { fled: { within: 3, on: 'ally', as: 'actor' } } }],
      })
    ).toThrow(
      /`fled` names both `on: ally` and `as: actor`, and a condition asks one thing/
    );

    // An unknown word is refused BY NAME — the two named readings, because
    // omitting the field is what "the creature itself" means.
    expect(
      table({ time: [{ when: { fled: { within: 3, on: 'self' } } }] })
    ).toThrow(
      /`on: self` is not a scope this build reads: they are ally, actor \(and omitting it means the creature itself\)/
    );
    expect(
      table({ time: [{ when: { fled: { within: 3, as: 'enemy' } } }] })
    ).toThrow(
      /`as: enemy` is not a scope this build reads: they are ally, actor/
    );

    // AN UNKNOWN BODY KEY IS REFUSED, NOT DROPPED. Before scopes a dropped key
    // here did nothing; now it would decide WHOSE deeds the row reads, so
    // `no: ally` would leave the condition firing for the wrong wound.
    expect(
      table({ time: [{ when: { fled: { within: 3, no: 'ally' } } }] })
    ).toThrow(/field no not found in type dungeonspec\.withinSpec/);
  });

  /** A scope is a refinement of a DEED, so it has no meaning on an enemy band
   * — and the body of `{ enemy: X }` is a scalar, so a body key there is not a
   * scope an author could have meant. */
  it('offers no scope on an enemy band', () => {
    expect(
      table({ time: [{ when: { enemy: { on: 'ally' } }, hold: {} }] })
    ).toThrow(/`enemy: ` is not a condition this build reads/);
  });

  /**
   * A NON-SCALAR SCOPE VALUE, WHERE THE SENTENCE DIVERGES (independent review
   * round, finding 2 — probed against yaml.v3 v3.0.1).
   *
   * The engine never reaches `scopeOf` for a mapping or a sequence: `Decode`
   * fails first and says "`<deed>` takes { within: N }: yaml: unmarshal
   * errors: …". This reader says the unknown-word sentence instead.
   *
   * BOTH REFUSE THE DOCUMENT — that is the property under test. The words
   * differ because the alternative is restating a Go yaml error string here,
   * which is the drift this module exists to prevent. Pinned so the divergence
   * is a known, held fact rather than something a future reader discovers.
   */
  it('refuses a non-scalar scope value, in its own words', () => {
    expect(
      table({ time: [{ when: { fled: { within: 3, on: { a: 'b' } } } }] })
    ).toThrow(/is not a scope this build reads/);
    expect(
      table({ time: [{ when: { fled: { within: 3, as: [1, 2] } } }] })
    ).toThrow(/is not a scope this build reads/);
  });

  /** The scalar classes DO match the engine exactly — the four the reviewer
   * verified: numbers and booleans read as their text, null is the absence,
   * and an empty string is refused. */
  it('matches the engine for every scalar scope value', () => {
    // `on: 5` / `on: true` decode to "5" / "true" and are refused by name.
    expect(table({ time: [{ when: { fled: { within: 3, on: 5 } } }] })).toThrow(
      /`on: 5` is not a scope this build reads/
    );
    expect(
      table({ time: [{ when: { fled: { within: 3, on: true } } }] })
    ).toThrow(/`on: true` is not a scope this build reads/);
    // `on: ""` is non-nil and empty, so the engine refuses it.
    expect(
      table({ time: [{ when: { fled: { within: 3, on: '' } } }] })
    ).toThrow(/is not a scope this build reads/);
    // `on: null` is nil — the ABSENCE, which means the creature itself.
    expect(
      validateAnswerTable(
        { time: [{ when: { fled: { within: 3, on: null } }, hold: {} }] },
        'on'
      )
    ).toEqual({ time: [{ when: { fled: { within: 3 } }, hold: {} }] });
  });

  /**
   * THE ENGINE'S OWN WALK DOCUMENT, READ BY THE BUILDER.
   *
   * `rpg-api`'s `feat/1885-creature-facts-walk` carries a v4 room that authors
   * BOTH scopes (`internal/dungeons/testdata/creature-facts-walk.yaml`), and
   * the walk compiles it through the real `PutDungeon` path. This is that
   * document's `guard-1` table, transcribed: the builder must be able to open
   * exactly the shape the engine has already accepted, which is the thing
   * #1199 exists to make true.
   */
  it('reads the engine’s walk table, both scopes, verbatim', () => {
    const walk = {
      time: [
        {
          when: { attacked: { within: 2, as: 'actor' } },
          hold: {},
          weight: 100,
        },
        {
          when: { attacked: { within: 3, on: 'ally' } },
          toward: 'enemy',
          weight: 50,
        },
        { when: { enemy: 'reach' }, attack: 'enemy', weight: 10 },
        { when: { enemy: 'seen' }, toward: 'enemy' },
        { when: { enemy: 'none' }, hold: {} },
      ],
    };
    expect(validateAnswerTable(walk, 'on')).toEqual(walk);
  });
});
