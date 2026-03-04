/**
 * Template factory for post scaffolding.
 */

/**
 * @typedef {{ heading: string; body?: string }} PostSection
 */

/**
 * @typedef {{
 *  title: string;
 *  topic: string;
 *  templateType: "daily" | "weekly" | "monthly" | string;
 *  contentKind: "daily" | "cluster" | "hub" | string;
 *  body?: string;
 * }} TemplateInput
 */

const DAILY_HEADINGS = [
  "오늘 무슨 일?",
  "왜 중요한가",
  "확인된 팩트",
  "앞으로 체크할 포인트"
];

/**
 * @param {TemplateInput} input
 */
export function createPostFromTemplate(input) {
  const sections = DAILY_HEADINGS.map((heading) => ({ heading, body: "" }));

  // Weekly/monthly can extend, but tests only require >=4.
  if (input.templateType === "weekly") {
    sections.push({ heading: "이번 주 주요 변화", body: "" });
  }
  if (input.templateType === "monthly") {
    sections.push({ heading: "이번 달 큰 흐름", body: "" });
  }

  return {
    title: input.title,
    topic: input.topic,
    templateType: input.templateType,
    contentKind: input.contentKind,
    body: input.body ?? "",
    sections
  };
}

export const __internal = {
  DAILY_HEADINGS
};
