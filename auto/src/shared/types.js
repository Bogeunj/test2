/**
 * Shared domain types & topic catalog.
 *
 * This project uses JS runtime modules with JSDoc types so that Vitest + TypeScript
 * tests can import `type { ... }` from this file.
 */

/**
 * @typedef {string} DraftTopic
 */

/**
 * @typedef {{
 *  title: string;
 *  url: string;
 *  source: string;
 *  publishedAt: string;
 * }} DraftSource
 */

/**
 * @typedef {{
 *  sourceTitle: string;
 *  sourceUrl: string;
 *  sourceName: string;
 *  publishedAt: string;
 *  bullets: [string, string, string];
 *  conclusion: string;
 * }} DraftEntry
 */

/**
 * @typedef {{
 *  topic: DraftTopic;
 *  title: string;
 *  categoryKey: string;
 *  categoryLabel: string;
 *  topicLabel: string;
 *  body: string;
 *  createdAt: string;
 *  sources: DraftSource[];
 *  entries: DraftEntry[];
 * }} TodayDraft
 */

/**
 * Exported runtime placeholders so tests can `import type { TodayDraft, DraftTopic }`.
 * The values are not used at runtime.
 */

/** @type {DraftTopic} */
export const DraftTopic = /** @type {any} */ ("market:crypto:bitcoin");

/** @type {TodayDraft} */
export const TodayDraft = /** @type {any} */ ({});

export const TOPIC_CATALOG = [
  {
    categoryKey: "market",
    categoryLabel: "시장/금융",
    topics: [
      { key: "market:crypto:bitcoin", label: "비트코인" },
      { key: "market:crypto:ethereum", label: "이더리움" },
      { key: "market:stocks:us", label: "미국 증시" }
    ]
  },
  {
    categoryKey: "geopolitics",
    categoryLabel: "지정학/국제",
    topics: [{ key: "world:middle-east", label: "중동 분쟁" }]
  },
  {
    categoryKey: "policy",
    categoryLabel: "정치/정책",
    topics: [{ key: "policy:korea", label: "국내 정치" }]
  }
];

/**
 * @param {string} topic
 */
export function resolveTopicMeta(topic) {
  for (const cat of TOPIC_CATALOG) {
    const found = cat.topics.find((t) => t.key === topic);
    if (found) {
      return {
        categoryKey: cat.categoryKey,
        categoryLabel: cat.categoryLabel,
        topicLabel: found.label
      };
    }
  }
  return null;
}
