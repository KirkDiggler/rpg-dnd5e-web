const fail = (message) => {
  throw new Error(`NPC activity profile: ${message}`);
};
const object = (value, keys, label) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...keys].sort())
  )
    fail(`${label} has unexpected fields`);
};
const text = (value, label) => {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 300 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    fail(`${label} must be a nonempty portable string`);
};
const hash = (value) => {
  if (!/^[a-f0-9]{64}$/.test(value)) fail('invalid hash');
};
const unique = (values, label) => {
  if (!Array.isArray(values) || new Set(values).size !== values.length)
    fail(`${label} must be a unique array`);
};

/** Build-time contract check; compatibility is provider-owned and hash-bound. */
export function parseNpcActivityProfile({ value, appearances }) {
  object(
    value,
    [
      'schemaVersion',
      'id',
      'jointCount',
      'library',
      'defaultActivityRef',
      'walkActivityRef',
      'activities',
      'poseBridges',
      'appearances',
    ],
    'profile'
  );
  if (
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.jointCount) ||
    value.jointCount < 1
  )
    fail('unsupported schema or joint count');
  text(value.id, 'id');
  object(value.library, ['file', 'sha256', 'clips'], 'library');
  const file = value.library.file;
  if (
    typeof file !== 'string' ||
    !file.startsWith('npcs/') ||
    !file.endsWith('.glb') ||
    file.includes('\\') ||
    file.includes(':') ||
    file.split('/').some((p) => !p || p === '.' || p === '..')
  )
    fail('unsafe library path');
  hash(value.library.sha256);
  unique(value.library.clips, 'library clips');
  if (!value.library.clips.length) fail('empty library clips');
  value.library.clips.forEach((c) => text(c, 'clip'));
  if (
    !value.activities ||
    typeof value.activities !== 'object' ||
    Array.isArray(value.activities)
  )
    fail('activities must be a map');
  const activities = value.activities;
  if (
    !Object.hasOwn(activities, value.defaultActivityRef) ||
    !Object.hasOwn(activities, value.walkActivityRef)
  )
    fail('default/walk activity is undeclared');
  unique(value.poseBridges, 'pose bridges');
  value.poseBridges.forEach((b) => text(b, 'pose bridge'));
  const clips = new Set();
  for (const [ref, activity] of Object.entries(activities)) {
    if (!/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+:[a-zA-Z0-9_:-]+$/.test(ref))
      fail('invalid activity reference');
    object(
      activity,
      [
        'label',
        'entryPose',
        'exitPose',
        'enter',
        'sustain',
        'exit',
        'leaveAt',
        'moving',
      ],
      ref
    );
    for (const key of ['label', 'entryPose', 'exitPose', 'sustain'])
      text(activity[key], key);
    if (!['any-time', 'loop-boundary'].includes(activity.leaveAt))
      fail('invalid sustain boundary');
    if (typeof activity.moving !== 'boolean') fail('moving must be boolean');
    for (const phase of ['enter', 'sustain', 'exit']) {
      if (activity[phase] === null && phase !== 'sustain') continue;
      text(activity[phase], `${phase} clip`);
      clips.add(activity[phase]);
    }
  }
  if (
    activities[value.defaultActivityRef].moving ||
    !activities[value.walkActivityRef].moving
  )
    fail('default/walk moving declaration disagrees');
  for (const from of Object.values(activities))
    for (const to of Object.values(activities)) {
      if (
        from.exitPose !== to.entryPose &&
        !value.poseBridges.includes(`${from.exitPose}→${to.entryPose}`)
      )
        fail('missing declared pose bridge');
    }
  if (!Array.isArray(value.appearances) || !value.appearances.length)
    fail('appearances must be nonempty');
  const seen = new Set();
  const selected = new Map(appearances.map((a) => [a.assetRef, a]));
  for (const row of value.appearances) {
    object(row, ['assetRef', 'standingSha256'], 'appearance');
    const body = selected.get(row.assetRef);
    if (!body || seen.has(row.assetRef))
      fail('unselected or duplicate appearance');
    seen.add(row.assetRef);
    hash(row.standingSha256);
    if (body.standingSha256 !== row.standingSha256)
      fail('appearance body hash differs');
    if (body.jointCount !== value.jointCount)
      fail('appearance joint count differs');
    if (body.animationClips.some((c) => value.library.clips.includes(c)))
      fail('ambiguous clip ownership');
    const available = new Set([...body.animationClips, ...value.library.clips]);
    if ([...clips].some((c) => !available.has(c)))
      fail('missing configured clip');
  }
  return {
    ...value,
    library: {
      url: `/models/synty/${file}`,
      sha256: value.library.sha256,
      clips: [...value.library.clips],
    },
  };
}
