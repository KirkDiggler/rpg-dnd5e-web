/**
 * searchNotice — the ONE thing the UI is allowed to say after a search
 * resolves.
 *
 * THE SECRECY LAW, PINNED AS A TYPE (rpg-project#350): `SearchResponse`
 * carries no outcome — a search that finds nothing and a search that
 * fails answer with the same bytes, deliberately, so a response that
 * said anything about outcome would tell a failed searcher whether there
 * had been something to find. A constant has no way to vary with what it
 * never received: this string is not a function of `SearchResponse`, and
 * there is no call site here that COULD read one to decide what to say.
 * If the UI ever wants "you find nothing" it must say it for every
 * search alike or not at all — see design.md, "the law this wave must
 * not break." A find still reaches the searcher, later, as its own
 * DOOR_REVEALED beat — never through this string.
 */
export const SEARCH_NOTICE = 'You search the area.';
