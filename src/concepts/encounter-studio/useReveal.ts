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
 * - marked for a few seconds with `data-revealed` (an outline and a brief
 *   background, styled once in the studio's CSS, still under
 *   `prefers-reduced-motion`).
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
export const REVEAL_MARK_MS = 2500;

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
  register(key: RevealKey, element: HTMLElement): () => void;
  reveal(key: RevealKey): void;
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
  const pending = useRef<{ chain: RevealKey[]; timer: number } | null>(null);
  const marked = useRef<{ element: HTMLElement; timer: number } | null>(null);
  useEffect(
    () => () => {
      if (pending.current) window.clearTimeout(pending.current.timer);
      if (marked.current) window.clearTimeout(marked.current.timer);
    },
    []
  );
  return useMemo(() => {
    const first = (key: RevealKey): HTMLElement | undefined => {
      const set = registry.current.get(revealKeyString(key));
      return set ? [...set].find((element) => element.isConnected) : undefined;
    };
    const mark = (element: HTMLElement): void => {
      if (marked.current) {
        window.clearTimeout(marked.current.timer);
        marked.current.element.removeAttribute('data-revealed');
      }
      element.setAttribute('data-revealed', '');
      const timer = window.setTimeout(() => {
        element.removeAttribute('data-revealed');
        if (marked.current?.element === element) marked.current = null;
      }, REVEAL_MARK_MS);
      marked.current = { element, timer };
    };
    const show = (element: HTMLElement): void => {
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
      register(key, element) {
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
  key: RevealKey | null | undefined
): (element: HTMLElement | null) => void {
  const controller = useContext(RevealContext);
  const id = key ? revealKeyString(key) : null;
  const release = useRef<(() => void) | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;
  return useCallback(
    (element: HTMLElement | null) => {
      release.current?.();
      release.current = null;
      if (element && controller && keyRef.current)
        release.current = controller.register(keyRef.current, element);
    },
    // The ref is rebuilt when the key changes, so React re-registers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controller, id]
  );
}
