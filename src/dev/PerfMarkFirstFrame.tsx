import { addAfterEffect } from '@react-three/fiber';
import { useEffect } from 'react';
import { mark, perfMarksEnabled, type PerfMarkName } from './perfMarks';

/**
 * Marks `name` once, after the first frame this component's Canvas renders
 * (R3F's global after-effect runs after `gl.render`, so shader compilation
 * on that first frame is inside the measurement). Renders nothing; does not
 * subscribe at all unless perf marks are on.
 */
export function PerfMarkFirstFrame({ name }: { name: PerfMarkName }) {
  useEffect(() => {
    if (!perfMarksEnabled()) return;
    let done = false;
    const unsubscribe = addAfterEffect(() => {
      if (done) return;
      done = true;
      mark(name);
      unsubscribe();
    });
    return unsubscribe;
  }, [name]);
  return null;
}
