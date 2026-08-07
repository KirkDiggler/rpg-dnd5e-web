/**
 * useWasdKeys — the one WASD/arrow-key listener both walking camera
 * modes share (`WalkCamera.tsx`, `PlayCamera.tsx`) — rpg-project#169
 * follow-up unit. Returns a live `Set<KeyboardEvent['code']>` ref (not
 * React state — a per-frame `useFrame` read has no reason to trigger a
 * re-render on every keystroke) for `walkMovement.ts`'s
 * `resolveMoveVector` to read each frame. Same TEXTAREA-target guard
 * every other keydown listener in this concept already follows (typing
 * in the YAML pane must never double as movement input).
 */
import { useEffect, useRef } from 'react';
import { KEY_TO_AXIS } from './walkMovement';

export function useWasdKeys(): React.RefObject<Set<string>> {
  const pressedKeys = useRef(new Set<string>());

  useEffect(() => {
    const keys = pressedKeys.current;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (KEY_TO_AXIS[e.code]) keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
    };
    const onBlur = () => keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.clear();
    };
  }, []);

  return pressedKeys;
}
