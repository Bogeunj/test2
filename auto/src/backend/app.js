import express from "express";
import crypto from "node:crypto";

import { InMemoryStore } from "./store.js";
import { createPostFromTemplate } from "./services/templates.js";
import { evaluateClaimEvidence } from "./services/evidence.js";
import { runComplianceChecks } from "./services/compliance.js";
import { createBriefingArchive } from "./services/briefingArchive.js";
import {
  crawlAndDraftTodayPost as defaultCrawlAndDraftTodayPost
} from "./services/crawler.js";
import { applyTakedownTransition } from "./services/takedown.js";

import { createDefaultFrontendState, renderDashboard } from "../frontend/dashboard.js";

/**
 * @param {InMemoryStore} store
 */
function computePipelineCounts(store) {
  const counts = { draft: 0, scheduled: 0, published: 0, blocked: 0, removed: 0 };
  for (const post of store.posts.values()) {
    const status = post.status;
    if (status && Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    }
  }
  return counts;
}

/**
 * @param {InMemoryStore} store
 */
function buildDashboardState(store, archiveRecords) {
  const state = createDefaultFrontendState();
  state.pipelineCounts = computePipelineCounts(store);
  state.selectedTopic = store.latestSelectedTopic;

  if (store.latestDraftPostId) {
    const post = store.getPost(store.latestDraftPostId);
    if (post) {
      state.complianceTargetPostTitle = post.title;
      const run = store.getComplianceRun(post.id);
      state.compliance = run?.results ?? [];
    }
  }

  // recent posts are persisted briefings.
  state.recentPosts = (archiveRecords ?? []).map((b) => ({
    id: b.id,
    briefingId: b.id,
    title: b.title,
    topic: b.topic,
    topicLabel: b.topicLabel,
    categoryLabel: b.categoryLabel,
    status: b.status,
    updatedAt: b.updatedAt
  }));

  // show latest draft content if present in store
  if (store.latestTodayDraft) {
    state.todayDraft = store.latestTodayDraft;
  }

  return state;
}

/**
 * @param {{
 *  crawlAndDraftTodayPost?: typeof defaultCrawlAndDraftTodayPost;
 *  archiveDir?: string;
 * }=} options
 */
export function buildApp(options = {}) {
  const crawlAndDraftTodayPost = options.crawlAndDraftTodayPost ?? defaultCrawlAndDraftTodayPost;
  const archiveDir = options.archiveDir ?? "./data/archive";

  const store = new InMemoryStore();
  const archive = createBriefingArchive(archiveDir);

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Root dashboard
  app.get("/", async (req, res) => {
    const records = await archive.list();
    const state = buildDashboardState(store, records);
    res.status(200).type("html").send(renderDashboard(state));
  });

  // ----- Draft generation (API)
  app.post("/api/drafts/today", async (req, res) => {
    const topic = String(req.body?.topic ?? "");
    try {
      const nowIso = new Date().toISOString();
      const draft = await crawlAndDraftTodayPost(topic, async () => "", nowIso);
      // Note: in tests, crawlAndDraftTodayPost is injected; the fetcher isn't used.

      const postId = `p_${crypto.randomUUID()}`;
      const post = store.createPost({
        id: postId,
        title: draft.title,
        topic: draft.topic,
        templateType: "daily",
        contentKind: "daily",
        body: draft.body,
        status: "draft"
      });

      store.latestDraftPostId = post.id;
      store.latestSelectedTopic = topic;
      store.latestTodayDraft = draft;

      // persist as briefing as well
      await archive.save({
        id: post.id,
        title: draft.title,
        categoryKey: draft.categoryKey,
        categoryLabel: draft.categoryLabel,
        topic: draft.topic,
        topicLabel: draft.topicLabel,
        createdAt: draft.createdAt,
        updatedAt: draft.createdAt,
        status: "draft",
        draft
      });

      res.status(200).json({ ...draft, postId: post.id });
    } catch (err) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  // ----- Draft generation (form)
  app.post("/today-draft", async (req, res) => {
    const topic = String(req.body?.topic ?? "");
    try {
      const nowIso = new Date().toISOString();
      const draft = await crawlAndDraftTodayPost(topic, async () => "", nowIso);

      const postId = `bf_${crypto.randomUUID()}`;
      store.createPost({
        id: postId,
        title: draft.title,
        topic: draft.topic,
        templateType: "daily",
        contentKind: "daily",
        body: draft.body,
        status: "draft"
      });

      store.latestDraftPostId = postId;
      store.latestSelectedTopic = topic;
      store.latestTodayDraft = draft;

      await archive.save({
        id: postId,
        title: draft.title,
        categoryKey: draft.categoryKey,
        categoryLabel: draft.categoryLabel,
        topic: draft.topic,
        topicLabel: draft.topicLabel,
        createdAt: draft.createdAt,
        updatedAt: draft.createdAt,
        status: "draft",
        draft
      });

      res.redirect(303, "/");
    } catch (err) {
      res.status(400).send(String(err?.message ?? err));
    }
  });

  // Compliance run for latest draft (form)
  app.post("/compliance/run-latest", (req, res) => {
    const postId = store.latestDraftPostId;
    if (!postId) {
      return res.redirect(303, "/");
    }

    try {
      const run = runComplianceChecks(store, postId);
      store.saveComplianceRun(postId, run);
      // If compliance fails, mark blocked.
      if (run.overall === "fail") {
        store.updatePost(postId, { status: "blocked" });
      }
    } catch {
      // ignore errors for this route
    }

    res.redirect(303, "/");
  });

  // ----- Briefings archive list
  app.get("/api/briefings", async (req, res) => {
    const records = await archive.list();
    res.status(200).json(records);
  });

  // ----- Delete briefing (form)
  app.post("/briefings/:id/delete", async (req, res) => {
    const id = String(req.params.id);
    await archive.remove(id);
    store.removePost(id);
    res.redirect(303, "/#recent-drafts");
  });

  // ----- Sources
  app.post("/api/sources", (req, res) => {
    try {
      const source = store.createSource(req.body ?? {});
      res.status(200).json(source);
    } catch (err) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  // ----- Posts
  app.post("/api/posts", (req, res) => {
    try {
      const post = store.createPost(
        createPostFromTemplate({
          title: req.body?.title,
          topic: req.body?.topic,
          templateType: req.body?.templateType,
          contentKind: req.body?.contentKind,
          body: req.body?.body
        })
      );
      res.status(200).json(post);
    } catch (err) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  app.get("/api/posts/:id", (req, res) => {
    const post = store.getPost(String(req.params.id));
    if (!post) return res.status(404).json({ error: "not_found" });
    res.status(200).json(post);
  });

  app.post("/api/posts/:id/claims", (req, res) => {
    try {
      const claim = store.createClaim(String(req.params.id), {
        text: req.body?.text,
        severity: req.body?.severity
      });
      res.status(200).json(claim);
    } catch (err) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  // Schedule
  app.post("/api/posts/:id/schedule", (req, res) => {
    const id = String(req.params.id);
    try {
      const schedule = {
        timezone: req.body?.timezone,
        scheduledAt: req.body?.scheduledAt,
        cadence: req.body?.cadence,
        priority: req.body?.priority
      };
      const post = store.updatePost(id, { schedule, status: "scheduled" });
      res.status(200).json(post);
    } catch (err) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  // Compliance run (API)
  app.post("/api/posts/:id/compliance/run", (req, res) => {
    const id = String(req.params.id);
    try {
      const run = runComplianceChecks(store, id);
      store.saveComplianceRun(id, run);
      if (run.overall === "fail") {
        store.updatePost(id, { status: "blocked" });
      }
      res.status(200).json(run);
    } catch (err) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  // Publish
  app.post("/api/posts/:id/publish", (req, res) => {
    const id = String(req.params.id);
    const post = store.getPost(id);
    if (!post) return res.status(404).json({ error: "not_found" });

    // Must be scheduled and due.
    const schedule = post.schedule;
    if (!schedule || !schedule.scheduledAt) {
      return res.status(409).json({ code: "NOT_SCHEDULED" });
    }
    const scheduledAtMs = Date.parse(schedule.scheduledAt);
    if (!Number.isNaN(scheduledAtMs) && Date.now() < scheduledAtMs) {
      return res.status(409).json({ code: "NOT_DUE" });
    }

    // If no compliance run yet, run it.
    let complianceRun = store.getComplianceRun(id);
    if (!complianceRun) {
      try {
        complianceRun = store.saveComplianceRun(id, runComplianceChecks(store, id));
      } catch {
        // ignore
      }
    }

    if (complianceRun && complianceRun.overall === "fail") {
      store.updatePost(id, { status: "blocked" });
      return res.status(409).json({ code: "COMPLIANCE_FAILED" });
    }

    // Evidence check: any failing claim blocks publishing.
    const claims = store.listClaimsByPost(id);
    for (const claim of claims) {
      const status = evaluateClaimEvidence(store, claim.id);
      if (!status.passes) {
        return res.status(409).json({ code: "EVIDENCE_FAILED", details: status });
      }
    }

    store.updatePost(id, { status: "published" });
    res.status(200).json({ status: "published" });
  });

  // Claims citations
  app.post("/api/claims/:id/citations", (req, res) => {
    const id = String(req.params.id);
    try {
      const citation = store.createCitation(id, {
        sourceId: req.body?.sourceId,
        url: req.body?.url,
        excerpt: req.body?.excerpt
      });
      res.status(200).json(citation);
    } catch (err) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  // Evidence status API
  app.get("/api/claims/:id/evidence-status", (req, res) => {
    const id = String(req.params.id);
    try {
      const status = evaluateClaimEvidence(store, id);
      res.status(200).json(status);
    } catch (err) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  // Takedown
  app.post("/api/posts/:id/takedown", (req, res) => {
    const postId = String(req.params.id);
    const post = store.getPost(postId);
    if (!post) return res.status(404).json({ error: "not_found" });

    const previousStatus = post.status;
    const takedown = store.createTakedown({
      postId,
      reason: String(req.body?.reason ?? ""),
      state: "requested",
      previousPostStatus: previousStatus
    });

    // Block the post while takedown is processed.
    store.updatePost(postId, { status: "blocked" });

    res.status(201).json(takedown);
  });

  app.patch("/api/takedowns/:id/state", (req, res) => {
    const id = String(req.params.id);
    const takedown = store.getTakedown(id);
    if (!takedown) return res.status(404).json({ error: "not_found" });

    const next = String(req.body?.state ?? "");
    try {
      const updated = applyTakedownTransition(takedown, next);
      // persist updated takedown
      store.takedowns.set(id, { ...takedown, ...updated });

      const post = store.getPost(takedown.postId);
      if (post) {
        if (next === "rejected") {
          const restore = takedown.previousPostStatus ?? "draft";
          store.updatePost(post.id, { status: restore });
        } else if (next === "removed") {
          store.updatePost(post.id, { status: "removed" });
        } else {
          // in_review or approved
          store.updatePost(post.id, { status: "blocked" });
        }
      }

      res.status(200).json(store.getTakedown(id));
    } catch (err) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  // Dashboard summary API
  app.get("/api/dashboard/summary", (req, res) => {
    const postsCounts = computePipelineCounts(store);

    // sources by grade
    const sourcesByGrade = {};
    for (const source of store.sources.values()) {
      const grade = source.grade ?? "unknown";
      sourcesByGrade[grade] = (sourcesByGrade[grade] ?? 0) + 1;
    }

    // evidence metrics
    const criticalClaims = Array.from(store.claims.values()).filter((c) => c.severity === "critical");
    let criticalClaimsPassing = 0;
    for (const claim of criticalClaims) {
      const status = evaluateClaimEvidence(store, claim.id);
      if (status.passes) criticalClaimsPassing += 1;
    }

    // compliance metrics
    const compliance = { pass: 0, fail: 0, manual_review: 0 };
    for (const run of store.complianceRuns.values()) {
      if (run.overall === "pass") compliance.pass += 1;
      else if (run.overall === "fail") compliance.fail += 1;
      else compliance.manual_review += 1;
    }

    // takedowns
    const takedowns = { requested: 0, in_review: 0, approved: 0, rejected: 0, removed: 0 };
    for (const td of store.takedowns.values()) {
      const state = td.state;
      if (state && Object.prototype.hasOwnProperty.call(takedowns, state)) {
        takedowns[state] += 1;
      }
    }

    res.status(200).json({
      posts: postsCounts,
      sourcesByGrade,
      evidence: { criticalClaimsPassing },
      compliance,
      takedowns
    });
  });

  return { app, store, archive };
}
