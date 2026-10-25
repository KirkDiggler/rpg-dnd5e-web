import { usePortrait } from '@/portraits';
import { useState, type ReactElement } from 'react';
import styles from './MemberPortrait.module.css';

/** An image consumer only: roster disclosure, capture and cache belong to the provider. */
export function MemberPortrait({
  memberId,
  name,
  framing = 'body',
}: {
  memberId: string;
  name: string;
  framing?: 'body' | 'portrait';
}): ReactElement {
  const portrait = usePortrait(memberId);
  const [failed, setFailed] = useState<{ key: string; image: string } | null>(
    null
  );
  const decodeFailed =
    portrait.status === 'ready' &&
    failed?.key === portrait.key &&
    failed.image === portrait.image;
  if (portrait.status === 'ready' && !decodeFailed)
    return (
      <span className={styles.frame} data-framing={framing}>
        <img
          key={portrait.image}
          className={styles.image}
          src={portrait.image}
          alt={`${name} portrait`}
          draggable={false}
          onError={() =>
            setFailed({ key: portrait.key, image: portrait.image })
          }
        />
      </span>
    );
  const status = decodeFailed ? 'error' : portrait.status;
  const message = decodeFailed
    ? 'Portrait image could not be displayed.'
    : portrait.status === 'loading'
      ? 'Loading portrait.'
      : 'message' in portrait
        ? portrait.message
        : '';
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';
  return (
    <span
      className={styles.fallback}
      role="img"
      aria-label={`${name} portrait ${status}`}
      title={message}
      data-portrait-status={status}
    >
      {initials}
    </span>
  );
}
