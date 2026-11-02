import type { DialSpec } from './dialTypes';

/** Local presentation only; no turn authority or server timing. */
export const NOTIFICATION_DIAL_SPECS: readonly DialSpec[] = [
  {
    key: 'notificationDuration',
    label: 'Notification duration',
    group: 'notifications',
    kind: 'number',
    default: 1,
    min: 0.5,
    max: 3,
    step: 0.25,
    unit: '×',
  },
  {
    key: 'notificationPausePlayback',
    label: 'Pause turn playback while reading notifications',
    group: 'notifications',
    kind: 'enum',
    default: 'off',
    options: ['off', 'on'],
  },
];
