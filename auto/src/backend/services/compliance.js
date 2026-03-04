/**
 * Lightweight compliance gates.
 */

export const INVESTMENT_DISCLAIMER =
  "※ 투자 판단은 본인 책임이며, 본 정보는 투자 조언이 아닙니다.";

/**
 * @typedef {"pass" | "fail" | "manual_review"} GateStatus
 */

/**
 * @typedef {{ gate: string; status: GateStatus; reasons: string[] }} ComplianceGateResult
 */

/**
 * @param {import('../store.js').InMemoryStore} store
 * @param {string} postId
 */
export function runComplianceChecks(store, postId) {
  const post = store.getPost(postId);
  if (!post) throw new Error(`Post not found: ${postId}`);

  const body = String(post.body ?? "");

  /** @type {ComplianceGateResult[]} */
  const results = [];

  // Privacy gate: detect obvious email/phone patterns.
  {
    const reasons = [];
    const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const phoneRe = /\+?\d[\d\s-]{7,}\d/; // very permissive
    if (emailRe.test(body)) reasons.push("Email detected");
    if (phoneRe.test(body)) reasons.push("Phone detected");
    results.push({
      gate: "privacy",
      status: reasons.length > 0 ? "fail" : "pass",
      reasons
    });
  }

  // Copyright gate: crude quote density heuristic.
  {
    const quoteCount = (body.match(/\"/g) ?? []).length;
    const reasons = [];
    if (quoteCount >= 6) {
      reasons.push("High quote density");
    }
    results.push({
      gate: "copyright",
      status: reasons.length > 0 ? "fail" : "pass",
      reasons
    });
  }

  // Defamation gate: rumors + person name pattern triggers manual review.
  {
    const reasons = [];
    const rumor = /\brumou?r\b/i.test(body);
    const personName = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(body);
    let status = "pass";
    if (rumor && personName) {
      status = "manual_review";
      reasons.push("Rumor phrasing");
    }
    results.push({ gate: "defamation", status, reasons });
  }

  // Platform ads suitability gate.
  {
    const reasons = [];
    const shocking = /(graphic\s+violence|gore|dismember|beheading)/i.test(body);
    results.push({
      gate: "platform_ads",
      status: shocking ? "fail" : "pass",
      reasons: shocking ? ["Shocking content"] : reasons
    });
  }

  // Investment recommendation gate.
  {
    const reasons = [];
    const isRecommendation = /(should\s+buy|investors?\s+may\s+buy|buy\s+this\s+stock)/i.test(body);
    let status = "pass";
    if (isRecommendation) {
      const hasDisclaimer = body.includes(INVESTMENT_DISCLAIMER);
      if (!hasDisclaimer) {
        status = "fail";
        reasons.push("Missing investment disclaimer");
      }
    }
    results.push({ gate: "investment", status, reasons });
  }

  const overall = results.some((r) => r.status === "fail")
    ? "fail"
    : results.some((r) => r.status === "manual_review")
      ? "manual_review"
      : "pass";

  return { overall, results };
}
