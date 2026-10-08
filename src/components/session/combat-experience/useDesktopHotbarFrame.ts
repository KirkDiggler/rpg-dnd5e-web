import { useEffect, useState } from 'react';

/** One responsive opt-in for presentation and interaction; no device guessing. */
export function useDesktopHotbarFrame(container: HTMLElement | null): boolean {
  const [measurement, setMeasurement] = useState<{
    container: HTMLElement;
    desktop: boolean;
  } | null>(null);
  useEffect(() => {
    if (!container || typeof ResizeObserver === 'undefined') return;
    let disposed = false;
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find(({ target }) => target === container);
      if (disposed || !entry) return;
      const desktop =
        entry.contentRect.width >= 1000 && entry.contentRect.height > 500;
      setMeasurement((current) =>
        current?.container === container && current.desktop === desktop
          ? current
          : { container, desktop }
      );
    });
    observer.observe(container);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [container]);
  return measurement?.container === container && measurement?.desktop === true;
}
