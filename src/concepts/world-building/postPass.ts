/**
 * A POST'S PASS (rpg-project#928): what lets a mover through a post, as
 * dungeonspec's `PassSpec` reads it. Two spellings the engine runs:
 *
 *   pass: troupe-password      a fact the walker knows (a password)
 *   pass: { holds: admitted }  the post's holder holds `admitted` about the walker
 *
 * and the rest of the requirement grammar (a list, a `not`) that the form
 * does not author. The pass is CARRIED AS WRITTEN: the studio reads the two
 * spellings it edits and leaves every other one untouched — a pass still
 * written in the retired `{ recognized: … }` among them, which the engine
 * refuses naming `holds` (rpg-project#1005). Whether the fact
 * is one the file sets, and whether something in the file gives the
 * holding, is the compiler's to judge at Save & Play.
 */
import { normalizeBinding } from './monsterOrderEdits';
import type { RoomMonsterBinding } from './roomDraft';

/** What the pass form shows. `other` is a pass written in a shape the form
 * does not edit: shown as written, kept as written. */
export type PassForm =
  | { kind: 'none' }
  | { kind: 'fact'; fact: string }
  | { kind: 'holds'; holding: string }
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
    typeof pass.holds === 'string'
  )
    return { kind: 'holds', holding: pass.holds };
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
    case 'holds':
      return form.holding === '' ? undefined : { holds: form.holding };
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
    case 'holds':
      return `a walker the holder holds ${form.holding} about`;
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

/** A post as the form edits it (`dungeonspec` `HoldsSpec`): the door it
 * holds, the cells it holds it from (none: the creature's own cell), the
 * way it holds it (absent: both ways), and its pass. */
export interface PostShape {
  door: string;
  at?: { q: number; r: number }[];
  against?: string;
  pass?: unknown;
}

/** The ways a post holds its door; absent is both. */
export const POST_AGAINST = ['entering', 'leaving'] as const;

/** The binding with one state's post set — or removed for undefined, and
 * `posts` itself when it empties. Every other key is kept. */
export function setBindingPost(
  binding: RoomMonsterBinding | undefined,
  state: string,
  post: Record<string, unknown> | undefined
): RoomMonsterBinding | undefined {
  const raw = (binding as Record<string, unknown> | undefined)?.posts;
  const posts: Record<string, unknown> = mapping(raw) ? { ...raw } : {};
  if (post === undefined) delete posts[state];
  else posts[state] = post;
  const next = { ...(binding ?? {}) } as Record<string, unknown>;
  if (Object.keys(posts).length === 0) delete next.posts;
  else next.posts = posts;
  return normalizeBinding(next as RoomMonsterBinding);
}

/** A post with one field changed: the door; the way ('' for both, written
 * as nothing); the cells (none for the creature's own cell). Every other
 * key is kept in its place. */
export function withPost(
  post: Record<string, unknown>,
  patch: {
    door?: string;
    against?: string;
    at?: readonly { q: number; r: number }[];
  }
): Record<string, unknown> {
  const next = { ...post };
  if (patch.door !== undefined) next.door = patch.door;
  if (patch.against === '') delete next.against;
  else if (patch.against !== undefined) next.against = patch.against;
  if (patch.at !== undefined) {
    if (patch.at.length === 0) delete next.at;
    else next.at = patch.at.map((cell) => ({ q: cell.q, r: cell.r }));
  }
  return next;
}
