import { PassField } from './PassField';
import { bindingPosts, setBindingPostPass } from './postPass';
import type { RoomMonsterBinding } from './roomDraft';

/**
 * A creature's `posts:` (rpg-api#1218), the posts its behavior's states hold,
 * as the studio edits them (rpg-project#928): the door and cells as written,
 * and the pass, through the same control a state's own post uses. Only the
 * pass is edited here; every other key of each post and of the binding is
 * kept as written. Nothing shows for a creature that posts nothing.
 */
export function BindingPostPasses({
  owner,
  binding,
  topics,
  onChange,
}: {
  owner: string;
  binding: RoomMonsterBinding | undefined;
  topics: readonly string[];
  onChange?: (next: RoomMonsterBinding | undefined) => void;
}): React.JSX.Element | null {
  const posts = bindingPosts(binding);
  const states = Object.keys(posts);
  if (states.length === 0) return null;
  return (
    <fieldset
      className="wb-policy-block"
      aria-label={`Behavior posts for ${owner}`}
    >
      <legend>Behavior posts</legend>
      <p className="wb-help">
        The posts this creature’s behavior states hold. The server checks the
        door, the cells and the pass when you play.
      </p>
      {states.map((state) => {
        const post = posts[state];
        const label = `${owner} ${state}`;
        return (
          <div
            key={state}
            className="wb-state-post"
            aria-label={`Behavior post for ${label}`}
          >
            <h5>{state}</h5>
            <p className="wb-help">
              Holds {String(post.door)}
              {typeof post.against === 'string' && post.against !== ''
                ? `, ${post.against}`
                : ''}
            </p>
            {onChange ? (
              <PassField
                label={label}
                value={post.pass}
                topics={topics}
                onChange={(pass) =>
                  onChange(setBindingPostPass(binding, state, pass))
                }
              />
            ) : (
              <p className="wb-help">Pass: {JSON.stringify(post.pass)}</p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
