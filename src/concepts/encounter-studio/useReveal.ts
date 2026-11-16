/**
 * ONE REVEAL CONTRACT (rpg-project#983). A jump lands on the exact item and
 * shows it. An item registers under a KEY — a stable identity `{kind, id,
 * part?}`, where `part` names a place inside the thing (`options[1]`, a row
 * `options[1].failure[0]`, a post `posts.alert`) in the file's own path
 * form — and a caller reveals a key. On reveal the item is:
 *
 * - shown: every closed `<details>` around it is opened first;
 * - scrolled into view within ITS OWN scroll container (the nearest
 *   scrolling ancestor), never by scrolling the page;
 * - focused, when it can take focus;
 * - marked with `data-revealed="true"` (an outline round the whole item and
 *   a tint, with a short entrance that `prefers-reduced-motion` drops; the
 *   outline is static). The mark LASTS: it moves with the next jump and
 *   clears on a click or key press outside the item, never on a timer.
 *
 * A key nothing owns yet is held until an item registers under it (a jump
 * usually switches home, group or section first), then fires once. If none
 * does within a short time, the nearest registered ancestor is revealed
 * instead — the same thing with a shorter `part`, then the thing itself —
 * and if none of those is registered nothing is marked. One implementation:
 * no screen scrolls or highlights a jump target on its own.
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

/** How long a reveal waits for its exact key before it settles for an
 * ancestor, and how long the mark stays. */
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

/** Show, scroll, focus: the landing itself, on the DOM. */
function land(element: HTMLElement): void {
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    if (node instanceof HTMLDetailsElement && !node.open) node.open = true;
  }
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
  if (element.matches(FOCUSABLE) && !(element as HTMLButtonElement).disabled)
    element.focus({ preventScroll: true });
}

/** The studio's one reveal controller. The workspace holds it; tests and
 * any other host use `RevealProvider`. */
export function useRevealController(): RevealController {
  const registry = useRef(new Map<string, Set<HTMLElement>>());
  /** What an item does to show itself before it lands: a list opens its
   * detail, a closed form opens. */
  const openers = useRef(new WeakMap<HTMLElement, () => void>());
  const pending = useRef<{ chain: RevealKey[]; timer: number } | null>(null);
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
      return set ? [...set].find((element) => element.isConnected) : undefined;
    };
    const unmark = (): void => {
      marked.current?.release();
      marked.current = null;
    };
    const mark = (element: HTMLElement): void => {
      unmark();
      element.setAttribute('data-revealed', 'true');
      // The author's next act elsewhere clears it: a click or key outside
      // the item. Listening starts after this turn, so the act that made
      // the jump does not clear its own mark.
      const outside = (event: Event): void => {
        if (event.target instanceof Node && element.contains(event.target))
          return;
        unmark();
      };
      const listen = window.setTimeout(() => {
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', outside, true);
      }, 0);
      marked.current = {
        element,
        release: () => {
          window.clearTimeout(listen);
          document.removeEventListener('pointerdown', outside, true);
          document.removeEventListener('keydown', outside, true);
          element.removeAttribute('data-revealed');
        },
      };
    };
    const show = (element: HTMLElement): void => {
      openers.current.get(element)?.();
      land(element);
      mark(element);
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
      resolve: (path) => resolver.current?.(path) ?? null,
      setResolver(next) {
        resolver.current = next;
      },
      register(key, element, onReveal) {
        if (onReveal) openers.current.set(element, onReveal);
        // Said on the element, for whoever reads the page (and its tests).
        element.setAttribute('data-reveal-key', `${key.kind}:${key.id}`);
        if (key.part) element.setAttribute('data-reveal-part', key.part);
        const id = revealKeyString(key);
        const set = registry.current.get(id) ?? new Set<HTMLElement>();
        set.add(element);
        registry.current.set(id, set);
        const waiting = pending.current;
        if (waiting && revealKeyString(waiting.chain[0]!) === id) {
          window.clearTimeout(waiting.timer);
          pending.current = null;
          // The item has just been attached (a ref runs in the commit,
          // after layout), so it lands now.
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
        const exact = first(key);
        if (exact) return show(exact);
        const chain = revealChain(key);
        pending.current = {
          chain,
          timer: window.setTimeout(settle, REVEAL_WAIT_MS),
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
  path: string | undefined
): (element: HTMLElement | null) => void {
  const controller = useContext(RevealContext);
  return useRevealable(path ? (controller?.resolve(path) ?? null) : null);
}
