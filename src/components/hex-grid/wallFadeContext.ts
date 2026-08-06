/**
 * Opt-in flag telling `GlbInstance` that the pieces beneath it are WALLS the
 * see-through driver (`WallSeeThrough.tsx`, `?wallSee=1`) is allowed to fade.
 *
 * A context rather than a prop deliberately. Wall pieces reach `GlbInstance`
 * through six separate call sites across `WallRunMesh` (tiled envelope runs,
 * connector runs, fallback segments) and `SyntyHexWall` (per-cell segments,
 * door frames/leaves, corner fittings), each behind its own intermediate
 * component with its own heavily-documented prop surface. Threading a boolean
 * through all of them would add six props that every caller must remember to
 * forward, and forgetting one would silently leave a door frame solid inside
 * an otherwise-faded wall — a bug with no compile-time signal. The subtree is
 * exactly "the walls", which is what a context is for.
 *
 * Default `false` means every existing mount renders byte-identically to
 * before this existed: no material cloning, no `alphaHash`, no tagging.
 */

import { createContext } from 'react';

export const WallFadeContext = createContext(false);
