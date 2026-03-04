import { describe, expect, it } from "vitest";

import { createDefaultFrontendState, renderDashboard } from "../../src/frontend/dashboard.js";

describe("frontend dashboard", () => {
  it("places today-draft generator at top and removes source policy board", () => {
    const html = renderDashboard(createDefaultFrontendState());

    expect(html).toContain("오늘의 게시물 생성");
    expect(html).not.toContain("Source Policy Board");
  });

  it("renders topic select and start button", () => {
    const html = renderDashboard(createDefaultFrontendState());

    expect(html).toContain('id="today-topic"');
    expect(html).toContain('id="start-topic-crawl"');
    expect(html).toContain('action="/today-draft"');
  });

  it("TC-UX2-FE-002 renders topic options with category optgroups", () => {
    const html = renderDashboard(createDefaultFrontendState());

    expect(html).toContain("<optgroup");
    expect(html).toContain("시장/금융");
    expect(html).toContain("지정학/국제");
  });

  it("renders compliance form that actually submits", () => {
    const state = createDefaultFrontendState();
    state.complianceTargetPostTitle = "[2026-03-03] 월드 데일리 브리핑";

    const html = renderDashboard(state);

    expect(html).toContain('action="/compliance/run-latest"');
    expect(html).toContain("Run compliance");
    expect(html).toContain("월드 데일리 브리핑");
  });

  it("renders pipeline summary counts", () => {
    const state = createDefaultFrontendState();
    state.pipelineCounts = {
      draft: 4,
      scheduled: 1,
      published: 2,
      blocked: 0,
      removed: 0
    };

    const html = renderDashboard(state);
    expect(html).toContain("draft</span> (4)");
    expect(html).toContain("scheduled</span> (1)");
    expect(html).toContain("published</span> (2)");
  });

  it("TC-UX3-FE-001 explains how each pipeline status is entered", () => {
    const html = renderDashboard(createDefaultFrontendState());

    expect(html).toContain("schedule API");
    expect(html).toContain("publish API");
    expect(html).toContain("컴플라이언스 실패");
  });

  it("renders recent draft list", () => {
    const state = createDefaultFrontendState();
    state.recentPosts = [
      {
        id: "p1",
        briefingId: "p1",
        title: "[2026-03-03] 월드 데일리 브리핑",
        topic: "world:middle-east",
        topicLabel: "중동 분쟁",
        categoryLabel: "지정학/국제",
        status: "draft",
        updatedAt: "2026-03-03T10:00:00.000Z"
      }
    ];

    const html = renderDashboard(state);
    expect(html).toContain("최근에 생성한 브리핑");
    expect(html).toContain("월드 데일리 브리핑");
  });

  it("TC-UX2-FE-001 renders trash button form per briefing item", () => {
    const state = createDefaultFrontendState();
    state.recentPosts = [
      {
        id: "bf_1",
        briefingId: "bf_1",
        title: "[2026-03-03] 월드 데일리 브리핑",
        topic: "world:middle-east",
        topicLabel: "중동 분쟁",
        categoryLabel: "지정학/국제",
        status: "draft",
        updatedAt: "2026-03-03T10:00:00.000Z"
      }
    ];

    const html = renderDashboard(state);
    expect(html).toContain("/briefings/bf_1/delete");
    expect(html).toContain("🗑");
  });

  it("renders compliance statuses", () => {
    const state = createDefaultFrontendState();
    state.compliance = [
      { gate: "privacy", status: "fail", reasons: ["Email detected"] },
      { gate: "defamation", status: "manual_review", reasons: ["Rumor phrasing"] }
    ];

    const html = renderDashboard(state);

    expect(html).toContain("privacy - fail");
    expect(html).toContain("defamation - manual_review");
  });

  it("renders each source briefing with 3 bullets and conclusion", () => {
    const state = createDefaultFrontendState();
    state.todayDraft = {
      topic: "world:middle-east",
      title: "[2026-03-03] 월드 데일리 브리핑",
      categoryKey: "geopolitics",
      categoryLabel: "지정학/국제",
      topicLabel: "중동 분쟁",
      body: "unused",
      createdAt: "2026-03-03T00:00:00.000Z",
      sources: [
        {
          title: "World headline",
          url: "https://news.example/world",
          source: "News Example",
          publishedAt: "2026-03-03T00:00:00.000Z"
        }
      ],
      entries: [
        {
          sourceTitle: "World headline",
          sourceUrl: "https://news.example/world",
          sourceName: "News Example",
          publishedAt: "2026-03-03T00:00:00.000Z",
          bullets: ["요약1", "요약2", "요약3"],
          conclusion: "결론 문장"
        }
      ]
    };

    const html = renderDashboard(state);
    expect(html).toContain("[제목] World headline");
    expect(html).toContain("요약1");
    expect(html).toContain("요약2");
    expect(html).toContain("요약3");
    expect(html).toContain("결론: 결론 문장");
    expect(html).toContain("https://news.example/world");
  });
});
