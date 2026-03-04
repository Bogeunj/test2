import { TOPIC_CATALOG } from "../shared/types.js";

/**
 * @typedef {{
 *  id: string;
 *  briefingId: string;
 *  title: string;
 *  topic: string;
 *  topicLabel: string;
 *  categoryLabel: string;
 *  status: string;
 *  updatedAt: string;
 * }} RecentPost
 */

/**
 * @typedef {{
 *  draft: number;
 *  scheduled: number;
 *  published: number;
 *  blocked: number;
 *  removed: number;
 * }} PipelineCounts
 */

/**
 * @typedef {{ gate: string; status: string; reasons: string[] }} ComplianceEntry
 */

/**
 * @typedef {import('../shared/types.js').TodayDraft} TodayDraft
 */

/**
 * @typedef {{
 *  todayDraft: TodayDraft | null;
 *  complianceTargetPostTitle: string | null;
 *  compliance: ComplianceEntry[];
 *  pipelineCounts: PipelineCounts;
 *  recentPosts: RecentPost[];
 *  selectedTopic: string | null;
 * }} FrontendState
 */

export function createDefaultFrontendState() {
  return {
    todayDraft: null,
    complianceTargetPostTitle: null,
    compliance: [],
    pipelineCounts: {
      draft: 0,
      scheduled: 0,
      published: 0,
      blocked: 0,
      removed: 0
    },
    recentPosts: [],
    selectedTopic: null
  };
}

/**
 * Basic HTML escaping.
 * @param {string} value
 */
function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {FrontendState} state
 */
export function renderDashboard(state) {
  // Top section: today-draft generator
  const topicOptions = TOPIC_CATALOG.map((cat) => {
    const options = cat.topics
      .map((t) => {
        const selected = state.selectedTopic === t.key ? " selected" : "";
        return `<option value="${esc(t.key)}"${selected}>${esc(t.label)}</option>`;
      })
      .join("");
    return `<optgroup label="${esc(cat.categoryLabel)}">${options}</optgroup>`;
  }).join("");

  const pipeline = state.pipelineCounts;

  const complianceSection = state.complianceTargetPostTitle
    ? `<form method="post" action="/compliance/run-latest">
        <button type="submit">Run compliance</button>
        <span>${esc(state.complianceTargetPostTitle)}</span>
      </form>`
    : `<div>No compliance target</div>`;

  const complianceStatuses = state.compliance.length
    ? `<ul>${state.compliance
        .map((c) => `<li>${esc(c.gate)} - ${esc(c.status)}</li>`)
        .join("")}</ul>`
    : "";

  const recentDrafts = `<section id="recent-drafts">
      <h2>최근에 생성한 브리핑</h2>
      <ul>
        ${state.recentPosts
          .map((p) => {
            return `<li>
              <div>${esc(p.title)}</div>
              <div>${esc(p.categoryLabel)} · ${esc(p.topicLabel)}</div>
              <form method="post" action="/briefings/${esc(p.briefingId)}/delete">
                <button type="submit">🗑</button>
              </form>
            </li>`;
          })
          .join("")}
      </ul>
    </section>`;

  const todayDraftSection = state.todayDraft
    ? `<section id="today-draft">
        <h2>${esc(state.todayDraft.title)}</h2>
        ${state.todayDraft.entries
          .map((entry, idx) => {
            return `<article>
              <h3>${idx + 1}. [제목] ${esc(entry.sourceTitle)}</h3>
              <a href="${esc(entry.sourceUrl)}">${esc(entry.sourceUrl)}</a>
              <ul>
                <li>${esc(entry.bullets[0])}</li>
                <li>${esc(entry.bullets[1])}</li>
                <li>${esc(entry.bullets[2])}</li>
              </ul>
              <p>결론: ${esc(entry.conclusion)}</p>
            </article>`;
          })
          .join("")}
      </section>`
    : "";

  // Explanation block required by TC-UX3-FE-001
  const pipelineExplain = `<section id="pipeline-explain">
      <p>scheduled 상태는 schedule API 를 통해 들어갑니다.</p>
      <p>published 상태는 publish API 를 통해 들어갑니다.</p>
      <p>blocked 는 컴플라이언스 실패 시 집계됩니다.</p>
    </section>`;

  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Dashboard</title></head>
  <body>
    <h1>오늘의 게시물 생성</h1>

    <form method="post" action="/today-draft">
      <select id="today-topic" name="topic">${topicOptions}</select>
      <button id="start-topic-crawl" type="submit">Start</button>
    </form>

    <section id="pipeline">
      <div><span>draft</span> (${pipeline.draft})</div>
      <div><span>scheduled</span> (${pipeline.scheduled})</div>
      <div><span>published</span> (${pipeline.published})</div>
      <div><span>blocked</span> (${pipeline.blocked})</div>
      <div><span>removed</span> (${pipeline.removed})</div>
    </section>

    ${pipelineExplain}

    <section id="compliance">
      <h2>Compliance</h2>
      ${complianceSection}
      ${complianceStatuses}
      ${state.compliance
        .map((c) => `${esc(c.gate)} - ${esc(c.status)}`)
        .join("\n")}
    </section>

    ${todayDraftSection}

    ${recentDrafts}
  </body>
</html>`;
}
