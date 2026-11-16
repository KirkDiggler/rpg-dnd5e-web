/**
 * ONE REVEAL CONTRACT (rpg-project#983). A jump lands on the exact item and
 * shows it. An item registers under a KEY — a stable identity `{kind, id,
 * part?}`, where `part` names a place inside the thing (`options[1]`, a row
 * `options[1].failure[0]`, a post `posts.alert`) in the file's own path
 * form — and a caller reveals a key. On reveal the item is:
 *
 * - opened: its own `onReveal` runs first (a list chooses its row, a
 *   collapsed row opens), and every closed `<details>` around it opens;
 * - scrolled into view within ITS OWN scroll container (the nearest
 *   scrolling ancestor, or one marked `data-scroll-pane`), never the page;
 * - focused itself — never a field inside it — given `tabindex="-1"`
 *   when it takes no focus; an item may name its own navigation control
 *   (`data-reveal-focus` on a direct child, as a list row's button) to take
 *   the focus instead. A plain container is named for a screen reader from
 *   its key (a `div` or `span` as `role="group"`); a control keeps the name
 *   it says;
 * - marked with `data-revealed="true"` (an outline round the whole item and
 *   a tint, with a short entrance that `prefers-reduced-motion` drops). The
 *   mark LASTS: it moves with the next jump and clears on a new selection,
 *   a pointer down, or a key that edits or activates, outside the item.
 *
 * It lands at once on the closest registered link of the key's chain (the
 * item, then the same thing with a shorter part, then the thing): a
 * field-level place no item registers lands on its nearest ancestor with no
 * wait. A closer key that registers within a short time (a screen still
 * mounting) takes the landing over. Callers reveal after their navigation
 * has committed. One implementation: no screen scrolls or highlights a jump
 * target on its own.
 *
 * EXTENDING IT (also in CONTRACT.md, "Reveal"):
 * - A new id-keyed screen: put `useRevealable({kind, id}, onReveal)` (or
 *   `RevealLi`/`RevealDiv` with `revealKey`) on each item's
 *   whole block; `onReveal` opens whatever hides it. A list-and-detail
 *   screen gets this from `StudioListDetail`.
 * - A new path-keyed place inside a thing: register the element by its file
 *   path with `useRevealablePath(path)` (or `RevealDiv path=…`); the path
 *   map turns it into the same key a jump makes.
 * - A new kind of thing: one `case` in `locatePath.ts`, then its words in
 *   `placeName.ts` and its selection in `targetOfPath`; register its items
 *   under that kind.
 * - A new section: map it to its items' kind in `revealKey.ts`
 *   (`SECTION_KINDS`) so a section jump with an id lands on the item.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';

export interface RevealKey {
  kind: string;
  id: string;
  /** A place inside the thing, in the file's path form. */
  part?: string;
}

/** How long a reveal waits for an item to register under its key (a screen
 * the jump opened mounting), before it settles for the nearest ancestor
 * registered by then. The mark itself has no clock: it lasts. */
export const REVEAL_WAIT_MS = 700;

const SEP = '\u0000';
export const revealKeyString = (key: RevealKey): string =>
  `${key.kind}${SEP}${key.id}${SEP}${key.part ?? ''}`;

/** The key, then each shorter part, then the thing itself. */
export function revealChain(key: RevealKey): RevealKey[] {
  const chain: RevealKey[] = [key];
  let part = key.part;
  while (part) {
    const shorter = part.replace(/(\.[^.[\]]+|\[\d+\])$/, '');
    part = shorter === part ? '' : shorter;
    chain.push(part ? { ...key, part } : { kind: key.kind, id: key.id });
  }
  return chain;
}

export interface RevealController {
  register(
    key: RevealKey,
    element: HTMLElement,
    onReveal?: () => void
  ): () => void;
  reveal(key: RevealKey): void;
  /** Take the mark away: the author chose something new. */
  clear(): void;
  /** The words a revealed item is announced by, from its key (the
   * workspace names it with `placeName`); none without one. */
  setNamer(namer: ((key: RevealKey) => string | null) | null): void;
  /** A file path's key, through the host's one path map (the workspace
   * sets it with the document); null without one. */
  resolve(path: string): RevealKey | null;
  setResolver(resolver: ((path: string) => RevealKey | null) | null): void;
}

const FOCUSABLE =
  'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';

function scrollContainerOf(element: HTMLElement): HTMLElement | null {
  for (
    let node = element.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    // A pane can say it scrolls (`data-scroll-pane`) where its overflow
    // comes from a stylesheet the page may not have loaded yet.
    if (node.hasAttribute('data-scroll-pane')) return node;
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return node;
  }
  return null;
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** THE STUDIO'S ONE SCROLL: an element brought into view within its own
 * scroll container, never the page. A jump's landing uses it; so does a
 * list-and-detail piece bringing its stacked detail into view. */
export function bringIntoView(element: HTMLElement): void {
  const behavior: ScrollBehavior = reducedMotion() ? 'auto' : 'smooth';
  const container = scrollContainerOf(element);
  if (container) {
    const at =
      container.scrollTop +
      element.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      container.clientHeight / 3;
    const top = Math.max(0, at);
    if (typeof container.scrollTo === 'function')
      container.scrollTo({ top, behavior });
    else container.scrollTop = top;
  } else {
    element.scrollIntoView?.({ block: 'nearest', behavior });
  }
}

/** Show, scroll, focus: the landing itself, on the DOM. */
function land(element: HTMLElement): void {
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    if (node instanceof HTMLDetailsElement && !node.open) node.open = true;
  }
  bringIntoView(element);
  // FOCUS THE ITEM ITSELF, never a field inside it: a jump must not put the
  // cursor where the next key edits content. An item may name its own
  // navigation control as where focus goes (`data-reveal-focus` on a direct
  // child: a list row's button, which only chooses the row); otherwise the
  // item takes focus, given `tabindex="-1"` while marked when it has none.
  // The mark is its focus treatment.
  const own = focusTargetOf(element);
  if (own !== element) {
    own.focus({ preventScroll: true });
    return;
  }
  if (!element.matches(FOCUSABLE) || (element as HTMLButtonElement).disabled)
    element.setAttribute('tabindex', '-1');
  element.focus({ preventScroll: true });
}

/** Where a revealed item's focus goes: its own `data-reveal-focus` control,
 * or the item. */
function focusTargetOf(element: HTMLElement): HTMLElement {
  return (
    element.querySelector<HTMLElement>(':scope > [data-reveal-focus]') ??
    element
  );
}

/** Controls that carry their own name (their text): an `aria-label` would
 * override what they say, so a revealed one is not relabelled. */
const NAMED_CONTROL = 'a[href],button,input,select,textarea,summary';

/** Keys that edit or activate: a printable character, Enter, Space,
 * Backspace, Delete. A bare modifier, Tab, an arrow or Escape only looks
 * around, and leaves the mark. */
function editsOrActivates(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return (
    event.key.length === 1 ||
    event.key === 'Enter' ||
    event.key === 'Backspace' ||
    event.key === 'Delete'
  );
}

/** An element on screen rather than in a hidden pane. */
const shown = (element: HTMLElement): boolean =>
  element.isConnected && !element.closest('[hidden]');

/** The studio's one reveal controller. The workspace holds it; tests and
 * any other host use `RevealProvider`. */
export function useRevealController(): RevealController {
  const registry = useRef(new Map<string, Set<HTMLElement>>());
  /** What an item does to show itself before it lands: a list opens its
   * detail, a closed form opens. */
  const openers = useRef(new WeakMap<HTMLElement, () => void>());
  const pending = useRef<{ chain: RevealKey[]; timer: number } | null>(null);
  const namer = useRef<((key: RevealKey) => string | null) | null>(null);
  /** The key each element registered under, to name it when it lands. */
  const keys = useRef(new WeakMap<HTMLElement, RevealKey>());
  const marked = useRef<{ element: HTMLElement; release: () => void } | null>(
    null
  );
  const resolver = useRef<((path: string) => RevealKey | null) | null>(null);
  useEffect(
    () => () => {
      if (pending.current) window.clearTimeout(pending.current.timer);
      marked.current?.release();
    },
    []
  );
  return useMemo(() => {
    const first = (key: RevealKey): HTMLElement | undefined => {
      const set = registry.current.get(revealKeyString(key));
      if (!set) return undefined;
      const elements = [...set].filter((element) => element.isConnected);
      return elements.find(shown) ?? elements[0];
    };
    const unmark = (): void => {
      marked.current?.release();
      marked.current = null;
    };
    const mark = (element: HTMLElement, added: string[]): void => {
      element.setAttribute('data-revealed', 'true');
      // A screen reader hears where the jump landed: a plain container is
      // named, and a `div` or `span` given `role="group"` so the name is
      // announced. A control (or an item whose focus goes to its own
      // control) already says its name.
      const key = keys.current.get(element);
      const name = key ? namer.current?.(key) : null;
      if (
        name &&
        focusTargetOf(element) === element &&
        !element.matches(NAMED_CONTROL) &&
        !element.hasAttribute('aria-label') &&
        !element.hasAttribute('aria-labelledby')
      ) {
        element.setAttribute('aria-label', name);
        added.push('aria-label');
        if (
          (element.tagName === 'DIV' || element.tagName === 'SPAN') &&
          !element.hasAttribute('role')
        ) {
          element.setAttribute('role', 'group');
          added.push('role');
        }
      }
      // The author's next act elsewhere clears it: a pointer down, or a key
      // that edits or activates, outside the item. Listening starts after
      // this turn, so the act that made the jump does not clear its mark.
      const outsidePointer = (event: Event): void => {
        if (event.target instanceof Node && element.contains(event.target))
          return;
        unmark();
      };
      const outsideKey = (event: KeyboardEvent): void => {
        if (!editsOrActivates(event)) return;
        outsidePointer(event);
      };
      const listen = window.setTimeout(() => {
        document.addEventListener('pointerdown', outsidePointer, true);
        document.addEventListener('keydown', outsideKey, true);
      }, 0);
      marked.current = {
        element,
        release: () => {
          window.clearTimeout(listen);
          document.removeEventListener('pointerdown', outsidePointer, true);
          document.removeEventListener('keydown', outsideKey, true);
          element.removeAttribute('data-revealed');
          for (const attribute of added) element.removeAttribute(attribute);
        },
      };
    };
    const show = (element: HTMLElement): void => {
      unmark();
      openers.current.get(element)?.();
      const added = element.hasAttribute('tabindex') ? [] : ['tabindex'];
      land(element);
      if (added.length && !element.hasAttribute('tabindex')) added.length = 0;
      mark(element, added);
    };
    const settle = (): void => {
      const waiting = pending.current;
      pending.current = null;
      if (!waiting) return;
      for (const key of waiting.chain) {
        const element = first(key);
        if (element) return show(element);
      }
    };
    return {
      // A host with no path map (a panel used alone) keys a place by its
      // raw path.
      resolve: (path) =>
        resolver.current ? resolver.current(path) : { kind: 'path', id: path },
      setResolver(next) {
        resolver.current = next;
      },
      setNamer(next) {
        namer.current = next;
      },
      clear: unmark,
      register(key, element, onReveal) {
        if (onReveal) openers.current.set(element, onReveal);
        keys.current.set(element, key);
        // Said on the element, for whoever reads the page (and its tests).
        element.setAttribute('data-reveal-key', `${key.kind}:${key.id}`);
        if (key.part) element.setAttribute('data-reveal-part', key.part);
        const id = revealKeyString(key);
        const set = registry.current.get(id) ?? new Set<HTMLElement>();
        set.add(element);
        registry.current.set(id, set);
        // A key a reveal is still waiting for, closer than where it landed:
        // the item has just been attached (a ref runs in the commit), so it
        // lands now.
        const waiting = pending.current;
        const at = waiting
          ? waiting.chain.findIndex((link) => revealKeyString(link) === id)
          : -1;
        if (waiting && at >= 0) {
          if (at === 0) {
            window.clearTimeout(waiting.timer);
            pending.current = null;
          } else {
            waiting.chain = waiting.chain.slice(0, at);
          }
          show(element);
        }
        return () => {
          set.delete(element);
          if (set.size === 0) registry.current.delete(id);
        };
      },
      reveal(key) {
        if (pending.current) window.clearTimeout(pending.current.timer);
        pending.current = null;
        const chain = revealChain(key);
        // Land at once on the closest registered link: the item itself, or
        // — for a place no item registers (a field-level part like
        // `.check`) — its nearest registered ancestor. Only the links
        // closer than that wait, briefly, for a screen still mounting.
        const at = chain.findIndex((link) => first(link) !== undefined);
        if (at >= 0) show(first(chain[at]!)!);
        if (at === 0) return;
        const waiting = at > 0 ? chain.slice(0, at) : chain;
        pending.current = {
          chain: waiting,
          timer: window.setTimeout(
            at > 0
              ? () => {
                  pending.current = null;
                }
              : settle,
            REVEAL_WAIT_MS
          ),
        };
      },
    };
  }, []);
}

export const RevealContext = createContext<RevealController | null>(null);

/** Reveal a key; a no-op outside a provider. */
export function useReveal(): (key: RevealKey) => void {
  const controller = useContext(RevealContext);
  return useCallback((key: RevealKey) => controller?.reveal(key), [controller]);
}

/** Register an element under a key: put the returned ref on the item. A
 * null key registers nothing. */
export function useRevealable(
  key: RevealKey | null | undefined,
  /** Called on reveal before the item lands: open what hides it. */
  onReveal?: () => void
): (element: HTMLElement | null) => void {
  const controller = useContext(RevealContext);
  const id = key ? revealKeyString(key) : null;
  const release = useRef<(() => void) | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  return useCallback(
    (element: HTMLElement | null) => {
      release.current?.();
      release.current = null;
      if (element && controller && keyRef.current)
        release.current = controller.register(keyRef.current, element, () =>
          onRevealRef.current?.()
        );
    },
    // The ref is rebuilt when the key changes, so React re-registers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controller, id]
  );
}

/** Register an element under the key a file path names, through the host's
 * one path map: `room.room.monsterBindings.gate-1.options[1]` registers as
 * `{creature, gate-1, options[1]}`. */
export function useRevealablePath(
  path: string | undefined,
  /** Called on reveal before the item lands: open what hides it. */
  onReveal?: () => void
): (element: HTMLElement | null) => void {
  const controller = useContext(RevealContext);
  return useRevealable(
    path ? (controller?.resolve(path) ?? null) : null,
    onReveal
  );
}
