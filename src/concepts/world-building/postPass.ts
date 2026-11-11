/**
 * A POST'S PASS (rpg-project#928): what lets a mover through a post, as
 * dungeonspec's `PassSpec` reads it. Two spellings the engine runs:
 *
 *   pass: troupe-password           a fact the walker knows (a password)
 *   pass: { recognized: admitted }  the post's holder recognises the walker
 *
 * and the rest of the requirement grammar (a list, a `not`) that the form
 * does not author. The pass is CARRIED AS WRITTEN: the studio reads the two
 * spellings it edits and leaves every other one untouched. Whether the fact
 * is one the file sets, and whether some interaction's outcome grants the
 * topic, is the compiler's to judge at Save & Play.
 */
import { normalizeBinding } from './monsterOrderEdits';
import type { RoomMonsterBinding } from './roomDraft';

/** What the pass form shows. `other` is a pass written in a shape the form
 * does not edit: shown as written, kept as written. */
export type PassForm =
  | { kind: 'none' }
  | { kind: 'fact'; fact: string }
  | { kind: 'recognized'; topic: string }
  | { kind: 'other'; written: unknown };

const mapping = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The form a pass as written takes. */
export function passForm(pass: unknown): PassForm {
  if (pass === undefined || pass === null || pass === '')
    return { kind: 'none' };
  if (typeof pass === 'string') return { kind: 'fact', fact: pass };
  if (
    mapping(pass) &&
    Object.keys(pass).length === 1 &&
    typeof pass.recognized === 'string'
  )
    return { kind: 'recognized', topic: pass.recognized };
  return { kind: 'other', written: pass };
}

/** The pass a form writes; undefined for none. An id left empty is no pass
 * yet, never an empty word on disk. */
export function passOf(form: Exclude<PassForm, { kind: 'other' }>): unknown {
  switch (form.kind) {
    case 'none':
      return undefined;
    case 'fact':
      return form.fact === '' ? undefined : form.fact;
    case 'recognized':
      return form.topic === '' ? undefined : { recognized: form.topic };
  }
}

/** A pass as the read-only line says it. */
export function passWords(pass: unknown): string {
  const form = passForm(pass);
  switch (form.kind) {
    case 'none':
      return 'nobody passes';
    case 'fact':
      return `a walker who knows ${form.fact}`;
    case 'recognized':
      return `a walker the holder recognises as ${form.topic}`;
    case 'other':
      return JSON.stringify(form.written);
  }
}

/** A binding's `posts:` (rpg-api#1218), state to post, as written; empty
 * when it holds none. Carried on the binding as a key the studio does not
 * otherwise read. */
export function bindingPosts(
  binding: RoomMonsterBinding | undefined
): Record<string, Record<string, unknown>> {
  const posts = (binding as Record<string, unknown> | undefined)?.posts;
  if (!mapping(posts)) return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [state, post] of Object.entries(posts))
    if (mapping(post)) out[state] = post;
  return out;
}

/** The binding with one state's post's pass set, or removed for undefined.
 * Every other key of the post, of `posts:` and of the binding is kept. A
 * state the binding posts nothing in is left as it was. */
export function setBindingPostPass(
  binding: RoomMonsterBinding | undefined,
  state: string,
  pass: unknown
): RoomMonsterBinding | undefined {
  const posts = (binding as Record<string, unknown> | undefined)?.posts;
  if (!binding || !mapping(posts) || !mapping(posts[state])) return binding;
  const post: Record<string, unknown> = { ...posts[state] };
  if (pass === undefined) delete post.pass;
  else post.pass = pass;
  return normalizeBinding({
    ...binding,
    posts: { ...posts, [state]: post },
  } as RoomMonsterBinding);
}
