import crypto from "node:crypto";

/**
 * @typedef {"requested"|"in_review"|"approved"|"rejected"|"removed"} TakedownState
 */

/**
 * @typedef {{
 *  id: string;
 *  postId: string;
 *  reason: string;
 *  state: TakedownState;
 *  createdAt: string;
 *  updatedAt: string;
 *  previousPostStatus?: string;
 * }} TakedownCase
 */

/**
 * @param {string} postId
 * @param {string} reason
 * @returns {TakedownCase}
 */
export function createTakedownCase(postId, reason) {
  const now = new Date().toISOString();
  return {
    id: `td_${crypto.randomUUID()}`,
    postId,
    reason,
    state: "requested",
    createdAt: now,
    updatedAt: now
  };
}

const ALLOWED_TRANSITIONS = {
  requested: ["in_review"],
  in_review: ["approved", "rejected"],
  approved: ["removed"],
  rejected: [],
  removed: []
};

/**
 * @param {TakedownCase} takedown
 * @param {TakedownState} next
 * @returns {TakedownCase}
 */
export function applyTakedownTransition(takedown, next) {
  const allowed = ALLOWED_TRANSITIONS[takedown.state] ?? [];
  if (!allowed.includes(next)) {
    throw new Error("Invalid takedown transition");
  }
  return {
    ...takedown,
    state: next,
    updatedAt: new Date().toISOString()
  };
}
