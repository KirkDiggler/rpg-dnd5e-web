/**
 * stanceRing — the colour of the ring under a creature's token, read from
 * WHAT THIS PLAYER BELIEVES rather than from what the roster knows
 * (rpg-project#458, design `ideas/shenanigans/front-room-goblin.md`).
 *
 * # Why the belief and not the truth
 *
 * The faction ring already exists and it is TRUTH: one colour per declared
 * faction, taken off the roster, identical for every viewer. Kirk's ask is a
 * different thing and it is the perception law applied to stance — "a
 * perceptive person would see a monster pretending to be intimidated; the
 * accurate disposition colour shows to them."
 *
 * So the stance rides the PER-VIEWER SIGHTING, next to name and kind. The
 * proto's own doc on sightings says the server must not state a fact a
 * viewer's stale view could be wrong about, "because the fact is exactly what
 * an illusion has to be able to lie about." A stance is such a fact, and a
 * stance read live off the faction graph could only ever be true — a game with
 * no way to lie can never have illusion in it.
 *
 * # Today it changes nothing, and that is correct
 *
 * With no deception in play, every viewer's believed stance equals the derived
 * stance, so the ring matches the faction colour it always had. `pretend` is
 * the authored outcome where the two diverge, and it is a later slice. This
 * module lands now so that when it does, the change is to one function rather
 * than a rewrite everywhere.
 *
 * # It is empty at these pins, and the fallback is the point
 *
 * The session seam does not yet carry a believed stance — `session.Sighting`
 * has no stance field, so rpg-api sends the wire field empty — which means
 * every sighting today answers `null` here and the caller keeps the roster's
 * faction colour. The ring is therefore unchanged on the walk, and it starts
 * being a belief the moment the seam carries one, with no further web change.
 *
 * # Presentation only
 *
 * The ring decides nothing about who may be attacked, exactly as the faction
 * ring's own prop already says. It is a thing a player reads, not a rule.
 */

/**
 * The dungeon file's own closed vocabulary, carried as the author's word
 * rather than an enum — the same set `StanceChanged.stance` uses.
 */
export const STANCE_HOSTILE = 'hostile';
export const STANCE_NEUTRAL = 'neutral';
export const STANCE_ALLIED = 'allied';

/**
 * One colour per stance.
 *
 * HOSTILE KEEPS THE MAP'S OWN MONSTER RED and ALLIED the player blue, so a
 * believed stance never introduces a colour the player has to learn: a
 * creature believed hostile looks like every other enemy, and one believed
 * allied looks like a friend. Neutral takes the world-NPC gold, which already
 * means "here, and not on either side" on this map.
 */
export const STANCE_COLORS: Readonly<Record<string, string>> = {
  [STANCE_HOSTILE]: '#e53e3e',
  [STANCE_NEUTRAL]: '#d69e2e',
  [STANCE_ALLIED]: '#3182ce',
};

/**
 * The ring colour for one believed stance, or `null` when this observer holds
 * no word and the caller should fall back to the roster's faction colour.
 *
 * NULL FOR EMPTY, AND NULL FOR A WORD THIS BUILD DOES NOT KNOW. The wire says
 * empty means the observer has no belief, which is a different claim from
 * "neutral" and must not be resolved into one. An unrecognized word is the
 * same answer for the stronger reason: the vocabulary is the AUTHOR'S and a
 * later slice may add to it, so a client that guessed would paint a ring in a
 * colour that means something it invented.
 */
export function stanceRingColor(stance: string): string | null {
  return STANCE_COLORS[stance] ?? null;
}
