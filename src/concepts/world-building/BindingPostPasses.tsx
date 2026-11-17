import { useContext, useState } from 'react';
import { RevealDiv } from '../encounter-studio/RevealDiv';
import { behaviourStates } from './behaviourChoice';
import { PassField } from './PassField';
import {
  bindingPosts,
  POST_AGAINST,
  setBindingPost,
  setBindingPostPass,
  withPost,
} from './postPass';
import type { RoomMonsterBinding } from './roomDraft';
import { useRoutePicking } from './routePicking';
import { SiteNamesContext } from './siteNames';
import type { SiteScope } from './siteScope';

const AGAINST_LABELS: Record<string, string> = {
  entering: 'Entering',
  leaving: 'Leaving',
  both: 'Both ways',
};

/**
 * A CREATURE'S POSTS (rpg-api#1218, rpg-project#928, #975 D): the posts its
 * behaviour's states hold, as forms. Each post is keyed by a state of the
 * behaviour the creature runs, and holds a door (offered from the site's
 * doors), from cells picked on the map (none: the creature's own cell), one
 * way or both, with a pass. A post is added on a state of its behaviour not
 * yet posted — never a terminal one — and removed.
 *
 * A form, not a sentence: what a post does is the engine's read-back, shown
 * above this in the creature's inspector. A creature that runs no behaviour,
 * or one whose states the file does not write, is told so plainly, and its
 * posts (if any are written) are still edited.
 */
export function BindingPosts({
  owner,
  binding,
  scope,
  topics,
  onChange,
}: {
  owner: string;
  binding: RoomMonsterBinding | undefined;
  scope: SiteScope;
  topics: readonly string[];
  onChange?: (next: RoomMonsterBinding | undefined) => void;
}): React.JSX.Element | null {
  const names = useContext(SiteNamesContext);
  const picking = useRoutePicking();
  const posts = bindingPosts(binding);
  const posted = Object.keys(posts);
  const behaviour = behaviourStates(scope, binding);
  const free =
    behaviour.kind === 'states'
      ? behaviour.states.filter((state) => !posted.includes(state))
      : [];
  const [adding, setAdding] = useState('');
  const addState = free.includes(adding) ? adding : (free[0] ?? '');
  const at = `room.room.monsterBindings.${owner}.posts`;
  return (
    <fieldset
      className="wb-policy-block"
      aria-label={`Behavior posts for ${owner}`}
    >
      <legend>Behavior posts</legend>
      {behaviour.kind === 'none' && (
        <p className="wb-help" data-testid={`posts-no-behaviour-${owner}`}>
          This creature runs no behaviour, so it has no state to hold a post in.
        </p>
      )}
      {behaviour.kind === 'ambiguous' && (
        <p className="wb-help" data-testid={`posts-no-behaviour-${owner}`}>
          This creature runs several behaviours and names none as its
          behaviorState: the engine needs one named before any post is held.
        </p>
      )}
      {behaviour.kind === 'unattached' && (
        <p className="wb-help" data-testid={`posts-no-behaviour-${owner}`}>
          {`This creature’s behaviorState names \`${behaviour.body}\`, which is not one of its behaviours: the engine refuses that, so no post can be added here.`}
        </p>
      )}
      {behaviour.kind === 'unread' && (
        <p className="wb-help" data-testid={`posts-no-behaviour-${owner}`}>
          {`This creature runs \`${behaviour.behaviour}\`, whose states are not written in this file, so no post can be added here.`}
        </p>
      )}
      {posted.map((state) => {
        const post = posts[state]!;
        const label = `${owner} ${state}`;
        const path = `${at}.${state}`;
        const door = typeof post.door === 'string' ? post.door : '';
        const against = typeof post.against === 'string' ? post.against : '';
        const cells = Array.isArray(post.at)
          ? (post.at as { q: number; r: number }[])
          : [];
        const set = (next: Record<string, unknown>) =>
          onChange?.(setBindingPost(binding, state, next));
        return (
          <RevealDiv
            key={state}
            path={path}
            className="wb-state-post"
            aria-label={`Behavior post for ${label}`}
          >
            <div className="wb-post-head">
              <h5>
                Post in <code>{state}</code>
              </h5>
              {onChange && (
                <button
                  type="button"
                  className="wb-danger"
                  aria-label={`Remove post ${label}`}
                  onClick={() =>
                    onChange(setBindingPost(binding, state, undefined))
                  }
                >
                  Remove post
                </button>
              )}
            </div>
            <div className="wb-post-fields">
              <RevealDiv path={`${path}.door`} className="wb-post-field">
                <label>
                  <span>Door</span>
                  <select
                    aria-label={`Door for ${label}`}
                    value={door}
                    disabled={!onChange}
                    onChange={(event) =>
                      set(withPost(post, { door: event.target.value }))
                    }
                  >
                    {!names.doors.includes(door) && (
                      <option value={door}>{door || '(choose a door)'}</option>
                    )}
                    {names.doors.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
              </RevealDiv>
              <RevealDiv path={`${path}.against`} className="wb-post-field">
                <label>
                  <span>Against</span>
                  <select
                    aria-label={`Against for ${label}`}
                    value={against}
                    disabled={!onChange}
                    onChange={(event) =>
                      set(withPost(post, { against: event.target.value }))
                    }
                  >
                    {/* A written `both` IS "Both ways": one choice, kept as
                        written until another way is chosen. */}
                    <option value={against === 'both' ? 'both' : ''}>
                      Both ways
                    </option>
                    {POST_AGAINST.map((way) => (
                      <option key={way} value={way}>
                        {AGAINST_LABELS[way]}
                      </option>
                    ))}
                    {against !== '' &&
                      against !== 'both' &&
                      !(POST_AGAINST as readonly string[]).includes(
                        against
                      ) && (
                        <option value={against}>
                          {AGAINST_LABELS[against] ?? against}
                        </option>
                      )}
                  </select>
                </label>
              </RevealDiv>
              <RevealDiv
                path={`${path}.at`}
                className="wb-post-field wb-post-held"
              >
                <span className="wb-post-label">Held from</span>
                <div className="wb-post-held-line">
                  <span className="wb-help" data-testid={`Held cells ${label}`}>
                    {cells.length === 0
                      ? 'its own cell'
                      : `${cells.length} ${cells.length === 1 ? 'cell' : 'cells'}`}
                  </span>
                  {picking && onChange && (
                    <button
                      type="button"
                      aria-label={`Pick held cells on map for ${label}`}
                      onClick={() =>
                        picking.arm({
                          mode: 'cells',
                          label: `${owner}’s post in ${state}`,
                          route: cells.map((cell) => ({
                            q: cell.q,
                            r: cell.r,
                          })),
                          onDone: (picked) =>
                            set(withPost(post, { at: picked })),
                        })
                      }
                    >
                      Pick on map
                    </button>
                  )}
                </div>
              </RevealDiv>
              {onChange ? (
                <div className="wb-post-pass">
                  <PassField
                    label={label}
                    value={post.pass}
                    topics={topics}
                    onChange={(pass) =>
                      onChange(setBindingPostPass(binding, state, pass))
                    }
                  />
                </div>
              ) : null}
            </div>
          </RevealDiv>
        );
      })}
      {onChange && free.length > 0 && (
        <div className="wb-post-add">
          <label>
            <span>Add a post in</span>
            <select
              aria-label={`Add post state for ${owner}`}
              value={addState}
              onChange={(event) => setAdding(event.target.value)}
            >
              {free.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            aria-label={`Add post for ${owner}`}
            disabled={names.doors.length === 0}
            onClick={() =>
              onChange(
                setBindingPost(binding, addState, { door: names.doors[0]! })
              )
            }
          >
            Add a post
          </button>
        </div>
      )}
    </fieldset>
  );
}
