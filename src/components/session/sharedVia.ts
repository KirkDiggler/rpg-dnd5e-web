/**
 * sharedVia — what came through a friend (rpg-project#935, the sharing dial).
 *
 * At shared view an act may carry `Act.perceived.via`: the party members
 * whose senses contributed it. EMPTY means the viewer perceived it with their
 * own senses. Non-empty means some or all of it reached them through those
 * friends.
 *
 * THE RULING: SHOWN LIKE OWN, KNOWN NEVER. "If we are sharing intel then we
 * all see what the others see": a via entry is shown — logged, toasted,
 * detailed — exactly as the viewer's own would be, marked with whose senses
 * it came through. It gives the viewer's character nothing: it never patches
 * the map, the known secrets, or anything the client treats as the viewer's
 * own knowledge.
 *
 * The viewer named in `via` is not a friend: an entry whose `via` names only
 * the viewer is the viewer's own.
 */
import type {
  Act,
  Party,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';

/** The friends an act came through, in the order the server named them. */
export function throughFriends(
  act: Act | undefined,
  viewer: string
): readonly Party[] {
  const via = act?.perceived?.via ?? [];
  const seen = new Set<string>();
  const friends: Party[] = [];
  for (const party of via) {
    if (!party.id || party.id === viewer || seen.has(party.id)) continue;
    seen.add(party.id);
    friends.push(party);
  }
  return friends;
}

/** Whether any of an act reached the viewer through a friend's senses. */
export function cameThroughFriend(act: Act | undefined, viewer: string) {
  return throughFriends(act, viewer).length > 0;
}

/**
 * The friends' names as a reader says them: "Bea", "Bea and Tam",
 * "Bea, Tam and Rin". A member the client has no name for is "a party
 * member" — never a guessed name, never a raw id.
 */
export function friendNames(
  friends: readonly Party[],
  names: Readonly<Record<string, string>> | undefined
): string {
  const said = friends.map((party) => names?.[party.id] || 'a party member');
  if (said.length <= 1) return said[0] ?? '';
  return `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}`;
}

/** The mark: "through Bea", or '' for the viewer's own entry. */
export function throughMark(
  act: Act | undefined,
  viewer: string,
  names: Readonly<Record<string, string>> | undefined
): string {
  // A perception's headline already names who perceived it ("Bea hears
  // metal clanging"); the mark names only the friends it does not.
  const named = new Set(
    act ? perceivers(act, viewer).map((party) => party.id) : []
  );
  const friends = throughFriends(act, viewer).filter((p) => !named.has(p.id));
  return friends.length ? `through ${friendNames(friends, names)}` : '';
}

/**
 * Whether an act is the viewer's own KNOWLEDGE (rpg-project#935): nothing of
 * it came through a friend, AND — for a perception — the viewer is the one
 * who perceived it. Either saying otherwise makes the entry shown, never
 * known: no map or secret patch, no refetch of the viewer's own reads.
 */
export function isOwnKnowledge(act: Act | undefined, viewer: string): boolean {
  if (!act || cameThroughFriend(act, viewer)) return false;
  if (act.body.case !== 'perception') return true;
  return act.body.value.observer?.id === viewer;
}

/**
 * Who a perception names as its perceiver, as parties: the observer — or,
 * should a server name the viewer as observer of an entry that came through
 * friends, those friends, so the viewer is never said to have perceived what
 * they did not.
 */
export function perceivers(act: Act, viewer: string): readonly Party[] {
  if (act.body.case !== 'perception') return [];
  const observer = act.body.value.observer;
  const friends = throughFriends(act, viewer);
  if (observer?.id === viewer && friends.length) return friends;
  return observer?.id ? [observer] : [];
}
