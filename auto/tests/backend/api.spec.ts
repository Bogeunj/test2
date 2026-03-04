import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/backend/app.js";
import { INVESTMENT_DISCLAIMER } from "../../src/backend/services/compliance.js";
import type { TodayDraft } from "../../src/shared/types.js";

describe("backend api", () => {
  const pastIso = (): string => new Date(Date.now() - 60_000).toISOString();

  it("TC-API-001 returns missing independent source count in evidence API", async () => {
    const { app } = buildApp();

    const sourceOne = await request(app).post("/api/sources").send({
      domain: "source-one.com",
      url: "https://source-one.com/1",
      title: "source-one",
      grade: "A",
      independenceGroup: "group-one"
    });

    const post = await request(app).post("/api/posts").send({
      title: "Daily Brief",
      topic: "world",
      templateType: "daily",
      contentKind: "daily"
    });

    const claim = await request(app)
      .post(`/api/posts/${post.body.id}/claims`)
      .send({ text: "Key event happened", severity: "critical" });

    await request(app).post(`/api/claims/${claim.body.id}/citations`).send({
      sourceId: sourceOne.body.id,
      url: sourceOne.body.url
    });

    const evidence = await request(app).get(
      `/api/claims/${claim.body.id}/evidence-status`
    );

    expect(evidence.status).toBe(200);
    expect(evidence.body.passes).toBe(false);
    expect(evidence.body.missingIndependentSources).toBe(1);
  });

  it("TC-API-002 publish returns 409 when evidence fails", async () => {
    const { app } = buildApp();

    const sourceOne = await request(app).post("/api/sources").send({
      domain: "source-a.com",
      url: "https://source-a.com/1",
      title: "source-a",
      grade: "A",
      independenceGroup: "group-a"
    });

    const post = await request(app).post("/api/posts").send({
      title: "Conflict Watch",
      topic: "world",
      templateType: "daily",
      contentKind: "daily"
    });

    const claim = await request(app)
      .post(`/api/posts/${post.body.id}/claims`)
      .send({ text: "Strike confirmed", severity: "critical" });

    await request(app).post(`/api/claims/${claim.body.id}/citations`).send({
      sourceId: sourceOne.body.id,
      url: sourceOne.body.url
    });

    await request(app).post(`/api/posts/${post.body.id}/schedule`).send({
      timezone: "Asia/Seoul",
      scheduledAt: pastIso(),
      cadence: "daily",
      priority: 3
    });

    await request(app).post(`/api/posts/${post.body.id}/compliance/run`).send({});

    const publish = await request(app).post(`/api/posts/${post.body.id}/publish`).send({});

    expect(publish.status).toBe(409);
    expect(publish.body.code).toBe("EVIDENCE_FAILED");
  });

  it("TC-API-003 publish succeeds when scheduled and compliant", async () => {
    const { app } = buildApp();

    const sourceOne = await request(app).post("/api/sources").send({
      domain: "source-a.com",
      url: "https://source-a.com/1",
      title: "source-a",
      grade: "A",
      independenceGroup: "group-a"
    });

    const post = await request(app).post("/api/posts").send({
      title: "Stock Morning Brief",
      topic: "stocks",
      templateType: "daily",
      contentKind: "daily",
      body: `Analysts suggest investors may buy selectively. ${INVESTMENT_DISCLAIMER}`
    });

    const claim = await request(app)
      .post(`/api/posts/${post.body.id}/claims`)
      .send({ text: "Index moved up", severity: "major" });

    await request(app).post(`/api/claims/${claim.body.id}/citations`).send({
      sourceId: sourceOne.body.id,
      url: sourceOne.body.url
    });

    await request(app).post(`/api/posts/${post.body.id}/schedule`).send({
      timezone: "Asia/Seoul",
      scheduledAt: pastIso(),
      cadence: "daily",
      priority: 3
    });

    await request(app).post(`/api/posts/${post.body.id}/compliance/run`).send({});

    const publish = await request(app).post(`/api/posts/${post.body.id}/publish`).send({});

    expect(publish.status).toBe(200);
    expect(publish.body.status).toBe("published");
  });

  it("publish returns NOT_DUE when scheduled time is in future", async () => {
    const { app } = buildApp();

    const sourceOne = await request(app).post("/api/sources").send({
      domain: "future-source.com",
      url: "https://future-source.com/1",
      title: "future-source",
      grade: "A",
      independenceGroup: "future-source"
    });

    const post = await request(app).post("/api/posts").send({
      title: "Future Publish",
      topic: "stocks",
      templateType: "daily",
      contentKind: "daily",
      body: `investors may buy cautiously. ${INVESTMENT_DISCLAIMER}`
    });

    const claim = await request(app)
      .post(`/api/posts/${post.body.id}/claims`)
      .send({ text: "Market moved", severity: "major" });

    await request(app).post(`/api/claims/${claim.body.id}/citations`).send({
      sourceId: sourceOne.body.id,
      url: sourceOne.body.url
    });

    await request(app).post(`/api/posts/${post.body.id}/schedule`).send({
      timezone: "Asia/Seoul",
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
      cadence: "daily",
      priority: 3
    });

    await request(app).post(`/api/posts/${post.body.id}/compliance/run`).send({});
    const publish = await request(app).post(`/api/posts/${post.body.id}/publish`).send({});

    expect(publish.status).toBe(409);
    expect(publish.body.code).toBe("NOT_DUE");
  });

  it("rejected takedown restores previous post status", async () => {
    const { app } = buildApp();

    const sourceOne = await request(app).post("/api/sources").send({
      domain: "source-restore.com",
      url: "https://source-restore.com/1",
      title: "source-restore",
      grade: "A",
      independenceGroup: "restore-group"
    });

    const post = await request(app).post("/api/posts").send({
      title: "Restore Case",
      topic: "stocks",
      templateType: "daily",
      contentKind: "daily",
      body: `investors may buy cautiously. ${INVESTMENT_DISCLAIMER}`
    });

    const claim = await request(app)
      .post(`/api/posts/${post.body.id}/claims`)
      .send({ text: "Index rose", severity: "major" });

    await request(app).post(`/api/claims/${claim.body.id}/citations`).send({
      sourceId: sourceOne.body.id,
      url: sourceOne.body.url
    });

    await request(app).post(`/api/posts/${post.body.id}/schedule`).send({
      timezone: "Asia/Seoul",
      scheduledAt: pastIso(),
      cadence: "daily",
      priority: 3
    });

    await request(app).post(`/api/posts/${post.body.id}/compliance/run`).send({});
    await request(app).post(`/api/posts/${post.body.id}/publish`).send({});

    const takedown = await request(app).post(`/api/posts/${post.body.id}/takedown`).send({
      reason: "false alarm"
    });
    await request(app)
      .patch(`/api/takedowns/${takedown.body.id}/state`)
      .send({ state: "in_review" });
    await request(app)
      .patch(`/api/takedowns/${takedown.body.id}/state`)
      .send({ state: "rejected" });

    const restoredPost = await request(app).get(`/api/posts/${post.body.id}`);

    expect(restoredPost.status).toBe(200);
    expect(restoredPost.body.status).toBe("published");
  });

  it("TC-API-004 dashboard summary aggregates key metrics", async () => {
    const { app } = buildApp();

    const sourceOne = await request(app).post("/api/sources").send({
      domain: "source-a.com",
      url: "https://source-a.com/1",
      title: "source-a",
      grade: "S",
      independenceGroup: "group-a"
    });
    await request(app).post("/api/sources").send({
      domain: "source-b.com",
      url: "https://source-b.com/1",
      title: "source-b",
      grade: "A",
      independenceGroup: "group-b"
    });

    const post = await request(app).post("/api/posts").send({
      title: "Monthly Hub",
      topic: "crypto",
      templateType: "monthly",
      contentKind: "hub",
      body: INVESTMENT_DISCLAIMER
    });

    const claim = await request(app)
      .post(`/api/posts/${post.body.id}/claims`)
      .send({ text: "Trend remains stable", severity: "major" });

    await request(app).post(`/api/claims/${claim.body.id}/citations`).send({
      sourceId: sourceOne.body.id,
      url: sourceOne.body.url
    });

    await request(app).post(`/api/posts/${post.body.id}/schedule`).send({
      timezone: "Asia/Seoul",
      scheduledAt: pastIso(),
      cadence: "monthly",
      priority: 3
    });

    await request(app).post(`/api/posts/${post.body.id}/compliance/run`).send({});
    await request(app).post(`/api/posts/${post.body.id}/publish`).send({});

    const takedown = await request(app).post(`/api/posts/${post.body.id}/takedown`).send({
      reason: "rights request"
    });
    await request(app)
      .patch(`/api/takedowns/${takedown.body.id}/state`)
      .send({ state: "in_review" });

    const summary = await request(app).get("/api/dashboard/summary");

    expect(summary.status).toBe(200);
    expect(summary.body.posts.blocked).toBeGreaterThanOrEqual(1);
    expect(summary.body.sourcesByGrade.S).toBeGreaterThanOrEqual(1);
    expect(summary.body.evidence.criticalClaimsPassing).toBeGreaterThanOrEqual(0);
    expect(summary.body.compliance.pass).toBeGreaterThanOrEqual(1);
    expect(summary.body.takedowns.in_review).toBeGreaterThanOrEqual(1);
  });

  it("TC-F2-API-001 /api/drafts/today returns generated draft json", async () => {
    const tempArchiveDir = await mkdtemp(join(tmpdir(), "briefing-api-"));

    const fakeDraft: TodayDraft = {
      topic: "market:crypto:bitcoin",
      title: "[2026-03-03] 비트코인 데일리 브리핑",
      categoryKey: "market",
      categoryLabel: "시장/금융",
      topicLabel: "비트코인",
      body: "## 1. sample\n- bullet1\n- bullet2\n- bullet3\n결론: test",
      createdAt: "2026-03-03T00:00:00.000Z",
      sources: [
        {
          title: "sample",
          url: "https://news.example/1",
          source: "news",
          publishedAt: "2026-03-03T00:00:00.000Z"
        }
      ],
      entries: [
        {
          sourceTitle: "sample",
          sourceUrl: "https://news.example/1",
          sourceName: "news",
          publishedAt: "2026-03-03T00:00:00.000Z",
          bullets: ["bullet1", "bullet2", "bullet3"],
          conclusion: "test"
        }
      ]
    };

    const { app } = buildApp({
      crawlAndDraftTodayPost: async () => fakeDraft,
      archiveDir: tempArchiveDir
    });

    const response = await request(app)
      .post("/api/drafts/today")
      .send({ topic: "market:crypto:bitcoin" });

    expect(response.status).toBe(200);
    expect(response.body.topic).toBe("market:crypto:bitcoin");
    expect(response.body.title).toContain("비트코인");
    expect(response.body.postId).toBeTypeOf("string");

    await rm(tempArchiveDir, { recursive: true, force: true });
  });

  it("TC-F2-API-002 /today-draft form submit redirects and reflects latest draft", async () => {
    const tempArchiveDir = await mkdtemp(join(tmpdir(), "briefing-web-"));

    const fakeDraft: TodayDraft = {
      topic: "policy:korea",
      title: "[2026-03-03] 국내 정치 데일리 브리핑",
      categoryKey: "policy",
      categoryLabel: "정치/정책",
      topicLabel: "국내 정치",
      body: "## 1. sample politics\n- bullet1\n- bullet2\n- bullet3\n결론: test",
      createdAt: "2026-03-03T00:00:00.000Z",
      sources: [
        {
          title: "sample politics",
          url: "https://news.example/politics",
          source: "news",
          publishedAt: "2026-03-03T00:00:00.000Z"
        }
      ],
      entries: [
        {
          sourceTitle: "sample politics",
          sourceUrl: "https://news.example/politics",
          sourceName: "news",
          publishedAt: "2026-03-03T00:00:00.000Z",
          bullets: ["bullet1", "bullet2", "bullet3"],
          conclusion: "test"
        }
      ]
    };

    const { app } = buildApp({
      crawlAndDraftTodayPost: async () => fakeDraft,
      archiveDir: tempArchiveDir
    });

    const submit = await request(app)
      .post("/today-draft")
      .type("form")
      .send({ topic: "policy:korea" });
    expect(submit.status).toBe(303);
    expect(submit.headers.location).toBe("/");

    const root = await request(app).get("/");
    expect(root.status).toBe(200);
    expect(root.text).toContain("국내 정치 데일리 브리핑");

    await rm(tempArchiveDir, { recursive: true, force: true });
  });

  it("compliance form route runs checks for latest draft", async () => {
    const tempArchiveDir = await mkdtemp(join(tmpdir(), "briefing-compliance-"));

    const fakeDraft: TodayDraft = {
      topic: "world:middle-east",
      title: "[2026-03-03] 월드 데일리 브리핑",
      categoryKey: "geopolitics",
      categoryLabel: "지정학/국제",
      topicLabel: "중동 분쟁",
      body: "## 1. world\n- bullet1\n- bullet2\n- bullet3\n결론: test",
      createdAt: "2026-03-03T00:00:00.000Z",
      sources: [
        {
          title: "world",
          url: "https://news.example/world",
          source: "news",
          publishedAt: "2026-03-03T00:00:00.000Z"
        }
      ],
      entries: [
        {
          sourceTitle: "world",
          sourceUrl: "https://news.example/world",
          sourceName: "news",
          publishedAt: "2026-03-03T00:00:00.000Z",
          bullets: ["bullet1", "bullet2", "bullet3"],
          conclusion: "test"
        }
      ]
    };

    const { app } = buildApp({
      crawlAndDraftTodayPost: async () => fakeDraft,
      archiveDir: tempArchiveDir
    });

    await request(app)
      .post("/today-draft")
      .type("form")
      .send({ topic: "world:middle-east" });
    const runCompliance = await request(app).post("/compliance/run-latest").type("form").send({});
    expect(runCompliance.status).toBe(303);
    expect(runCompliance.headers.location).toBe("/");

    const root = await request(app).get("/");
    expect(root.status).toBe(200);
    expect(root.text).toContain("copyright - pass");

    await rm(tempArchiveDir, { recursive: true, force: true });
  });

  it("TC-UX2-API-001 /briefings/:id/delete removes persisted briefing", async () => {
    const tempArchiveDir = await mkdtemp(join(tmpdir(), "briefing-delete-"));

    const fakeDraft: TodayDraft = {
      topic: "world:middle-east",
      title: "[2026-03-03] 월드 데일리 브리핑",
      categoryKey: "geopolitics",
      categoryLabel: "지정학/국제",
      topicLabel: "중동 분쟁",
      body: "본문",
      createdAt: "2026-03-03T00:00:00.000Z",
      sources: [],
      entries: []
    };

    const { app } = buildApp({
      crawlAndDraftTodayPost: async () => fakeDraft,
      archiveDir: tempArchiveDir
    });

    await request(app).post("/today-draft").type("form").send({ topic: "world:middle-east" });
    const listBefore = await request(app).get("/api/briefings");
    expect(listBefore.status).toBe(200);
    expect(listBefore.body.length).toBe(1);

    const briefingId = listBefore.body[0].id;
    const remove = await request(app).post(`/briefings/${briefingId}/delete`).type("form").send({});
    expect(remove.status).toBe(303);
    expect(remove.headers.location).toBe("/#recent-drafts");

    const listAfter = await request(app).get("/api/briefings");
    expect(listAfter.status).toBe(200);
    expect(listAfter.body.length).toBe(0);

    await rm(tempArchiveDir, { recursive: true, force: true });
  });

  it("TC-UX2-API-002 keeps latest selected topic after generation", async () => {
    const tempArchiveDir = await mkdtemp(join(tmpdir(), "briefing-topic-"));

    const fakeDraft: TodayDraft = {
      topic: "market:crypto:ethereum",
      title: "[2026-03-03] 이더리움 데일리 브리핑",
      categoryKey: "market",
      categoryLabel: "시장/금융",
      topicLabel: "이더리움",
      body: "본문",
      createdAt: "2026-03-03T00:00:00.000Z",
      sources: [],
      entries: []
    };

    const { app } = buildApp({
      crawlAndDraftTodayPost: async () => fakeDraft,
      archiveDir: tempArchiveDir
    });

    await request(app)
      .post("/today-draft")
      .type("form")
      .send({ topic: "market:crypto:ethereum" });

    const root = await request(app).get("/");
    expect(root.status).toBe(200);
    expect(root.text).toContain('option value="market:crypto:ethereum" selected');

    await rm(tempArchiveDir, { recursive: true, force: true });
  });

  it("TC-UX3-API-002 reflects schedule/publish/removed transitions in root pipeline counts", async () => {
    const tempArchiveDir = await mkdtemp(join(tmpdir(), "briefing-pipeline-status-"));

    const fakeDraft: TodayDraft = {
      topic: "market:stocks:us",
      title: "[2026-03-03] 미국 증시 데일리 브리핑",
      categoryKey: "market",
      categoryLabel: "시장/금융",
      topicLabel: "미국 증시",
      body: "시장 동향 브리핑 본문",
      createdAt: "2026-03-03T00:00:00.000Z",
      sources: [],
      entries: []
    };

    const { app } = buildApp({
      crawlAndDraftTodayPost: async () => fakeDraft,
      archiveDir: tempArchiveDir
    });

    const generated = await request(app)
      .post("/api/drafts/today")
      .send({ topic: "market:stocks:us" });
    expect(generated.status).toBe(200);

    const postId = generated.body.postId as string;
    const schedule = await request(app).post(`/api/posts/${postId}/schedule`).send({
      timezone: "Asia/Seoul",
      scheduledAt: pastIso(),
      cadence: "daily",
      priority: 2
    });
    expect(schedule.status).toBe(200);

    const rootAfterSchedule = await request(app).get("/");
    expect(rootAfterSchedule.status).toBe(200);
    expect(rootAfterSchedule.text).toContain("scheduled</span> (1)");
    expect(rootAfterSchedule.text).toContain("published</span> (0)");

    const publish = await request(app).post(`/api/posts/${postId}/publish`).send({});
    expect(publish.status).toBe(200);

    const rootAfterPublish = await request(app).get("/");
    expect(rootAfterPublish.status).toBe(200);
    expect(rootAfterPublish.text).toContain("scheduled</span> (0)");
    expect(rootAfterPublish.text).toContain("published</span> (1)");

    const takedown = await request(app)
      .post(`/api/posts/${postId}/takedown`)
      .send({ reason: "rights request" });
    expect(takedown.status).toBe(201);

    const toInReview = await request(app)
      .patch(`/api/takedowns/${takedown.body.id}/state`)
      .send({ state: "in_review" });
    expect(toInReview.status).toBe(200);

    const toApproved = await request(app)
      .patch(`/api/takedowns/${takedown.body.id}/state`)
      .send({ state: "approved" });
    expect(toApproved.status).toBe(200);

    const toRemoved = await request(app)
      .patch(`/api/takedowns/${takedown.body.id}/state`)
      .send({ state: "removed" });
    expect(toRemoved.status).toBe(200);

    const rootAfterRemoved = await request(app).get("/");
    expect(rootAfterRemoved.status).toBe(200);
    expect(rootAfterRemoved.text).toContain("published</span> (0)");
    expect(rootAfterRemoved.text).toContain("removed</span> (1)");

    await rm(tempArchiveDir, { recursive: true, force: true });
  });
});
