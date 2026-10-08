import { useState } from 'react';
import styles from './DesktopActionSurface.module.css';
import type { ActionIconPresentation } from './organizedActionPresentation';

export function ActionArt({
  art,
  label,
}: {
  art?: ActionIconPresentation;
  label: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return art?.src && art.src !== failedSource ? (
    <span
      className={styles.art}
      style={{ maskImage: `url("${art.src}")` }}
      aria-hidden="true"
    >
      <img
        src={art.src}
        alt=""
        draggable={false}
        onError={() => setFailedSource(art.src)}
      />
    </span>
  ) : (
    <span className={styles.fallback} aria-hidden="true">
      {art?.fallback ?? label.slice(0, 2)}
    </span>
  );
}
