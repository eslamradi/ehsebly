/**
 * Flags for features that exist in the codebase but are deliberately not
 * reachable yet. A flag here means "built, not shown" — not "unfinished".
 */

/**
 * Groups: shared ledgers for households and trips.
 *
 * Hidden 2026-08-09. The Groups screens, the Worker's group/settlement
 * routes, and the group branch of the casual flow are all still present and
 * working — this only removes the entry point on Home, which is the single
 * door into the feature. Sign-in goes with it, because signing in is
 * something you only do to reach a group; casual splitting never needed an
 * account.
 *
 * To bring it back, set this to true. Nothing else needs to change.
 */
export const GROUPS_ENABLED = false;
