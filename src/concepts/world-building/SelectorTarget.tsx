/**
 * SelectorTarget — what a selector word acts on: a figure, a cell or a route
 * (rpg-project#720).
 *
 * ONE SELECT, FOUR KINDS. The sealed selector words the row may take, and —
 * on the word that walks to a place (`toward`) — "An authored cell (at)" and
 * "A route (path)" beside them. Choosing a cell or a route from a word opens
 * the Layout armed for it; the row keeps its word until the pick is Done, so
 * a cancelled pick writes nothing. A cell or a route already on the row shows
 * its chips and fields below the select ([RouteEditor]).
 *
 * The two choices are offered only where the studio can pick on its Layout
 * (or the row already carries one, so the select can say what it holds).
 * Elsewhere the engine's own sentence refuses `at`/`path` on another word,
 * and the reader says it when a file does.
 */
import {
  ANSWER_AT_SELECTOR,
  ANSWER_PATH_SELECTOR,
  ANSWER_SELECTOR_WORDS,
  type AnswerSelectorSpec,
} from '@/author/answerVocabulary';
import {
  selectorCell,
  selectorRoute,
  type AnswerSelectorShape,
  type AnswerWaypointShape,
} from './answerTableShape';
import { RouteEditor } from './RouteEditor';
import {
  cellSelector,
  routeSelector,
  waypointOf,
  wordTakesCell,
  wordTakesRoute,
} from './routeEdits';
import { firstCell, useLatest, useRoutePicking } from './routePicking';

export function SelectorTarget({
  word,
  label,
  value,
  selectorWords,
  onCommit,
  pickLabel = label,
  wrap = (select) => select,
}: {
  /** What the studio's pick status names: the table and row. */
  pickLabel?: string;
  /** The table word the selector sits on. */
  word: string;
  /** The row's name: "time entry", "gate-patrol row 3". */
  label: string;
  /** The selector as written. */
  value: unknown;
  /** The words this row may offer (already filtered for `actor`/`sound`). */
  selectorWords: readonly AnswerSelectorSpec[];
  onCommit: (selector: AnswerSelectorShape) => void;
  /** Wraps the select — a bundle's `$path` slot ([ParamSlot]). */
  wrap?: (select: React.JSX.Element) => React.ReactNode;
}) {
  const picking = useRoutePicking();
  const commitLatest = useLatest(onCommit);
  const selector = value as AnswerSelectorShape;
  const cell = selectorCell(selector);
  const route = selectorRoute(selector);
  const kind =
    cell !== undefined
      ? ANSWER_AT_SELECTOR.key
      : route !== undefined
        ? ANSWER_PATH_SELECTOR.key
        : typeof value === 'string'
          ? value
          : (ANSWER_SELECTOR_WORDS[0]?.key ?? '');
  const offerCell =
    wordTakesCell(word) && (picking !== undefined || cell !== undefined);
  const offerRoute =
    wordTakesRoute(word) && (picking !== undefined || route !== undefined);
  const name = `${word === 'away' ? 'From' : 'To'} for ${label}`;

  const choose = (next: string): void => {
    if (next === ANSWER_AT_SELECTOR.key) {
      // From a route, its first waypoint; from a word, a pick.
      const from = route ? firstCell(route) : undefined;
      if (from) return onCommit(cellSelector(from));
      picking?.arm({
        mode: 'cell',
        label: pickLabel,
        route: [],
        onDone: (picked) => {
          const at = firstCell(picked);
          if (at) commitLatest(cellSelector(at));
        },
      });
      return;
    }
    if (next === ANSWER_PATH_SELECTOR.key) {
      // From a cell, a route that starts there; from a word, a pick.
      if (cell) return onCommit(routeSelector([waypointOf(cell)]));
      picking?.arm({
        mode: 'route',
        label: pickLabel,
        route: [],
        onDone: (picked) => {
          if (picked.length > 0) commitLatest(routeSelector(picked));
        },
      });
      return;
    }
    onCommit(next);
  };

  const select = (
    <select
      aria-label={name}
      value={kind}
      onChange={(event) => choose(event.target.value)}
    >
      {selectorWords.map((s) => (
        <option key={s.key} value={s.key}>
          {s.label} ({s.key})
        </option>
      ))}
      {offerCell && (
        <option value={ANSWER_AT_SELECTOR.key}>
          {ANSWER_AT_SELECTOR.label} ({ANSWER_AT_SELECTOR.key})
        </option>
      )}
      {offerRoute && (
        <option value={ANSWER_PATH_SELECTOR.key}>
          {ANSWER_PATH_SELECTOR.label} ({ANSWER_PATH_SELECTOR.key})
        </option>
      )}
    </select>
  );

  return (
    <>
      <label className="wb-entry-target">
        <span>{word === 'away' ? 'From' : 'To'}</span>
        {cell === undefined && route === undefined ? wrap(select) : select}
      </label>
      {cell !== undefined && (
        <RouteEditor
          mode="cell"
          route={[waypointOf(cell)]}
          label={label}
          pickLabel={pickLabel}
          onChange={(picked) => {
            const at = firstCell(picked);
            if (at) onCommit(cellSelector(at));
          }}
        />
      )}
      {route !== undefined && (
        <RouteEditor
          mode="route"
          route={route}
          label={label}
          pickLabel={pickLabel}
          onChange={(next: AnswerWaypointShape[]) => {
            if (next.length > 0) onCommit(routeSelector(next));
          }}
        />
      )}
    </>
  );
}
