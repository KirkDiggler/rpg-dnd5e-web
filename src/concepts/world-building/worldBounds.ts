/**
 * THE ROOM EDITOR'S X/Z SANITY BOUND, in scene units (rpg-project#725 R3).
 *
 * The canvas is unbounded: the file carries no workspace, so nothing an
 * author places is bounded by a stored extent. What remains is a finiteness
 * defence for transforms, label points and wall lines — far beyond any floor
 * the paint cap (`MAX_FLOOR_HEXES`) allows — not a map size.
 */
export const MAX_WORLD_COORD = 100_000;
