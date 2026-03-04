import { describe, expect, it } from "vitest";

import { InMemoryStore } from "../../src/backend/store.js";
import {
  INVESTMENT_DISCLAIMER,
  runComplianceChecks
} from "../../src/backend/services/compliance.js";
import { evaluateClaimEvidence } from "../../src/backend/services/evidence.js";
import {
  DEFAULT_LINK_BOUNDS,
  recommendInternalLinks
} from "../../src/backend/services/internalLinks.js";
import {
  applyTakedownTransition,
  createTakedownCase
} from "../../src/backend/services/takedown.js";
import { createPostFromTemplate } from "../../src/backend/services/templates.js";

describe("backend domain services", () => {
  it("TC-BE-001 critical claim passes with two independent sources", () => {
    const store = new InMemoryStore();
    const post = store.createPost(
      createPostFromTemplate({
        title: "Crypto Daily",
        topic: "crypto",
        templateType: "daily",
        contentKind: "daily"
      })
    );
    const claim = store.createClaim(post.id, {
      text: "BTC rose 3% in 24h",
      severity: "critical"
    });
    const s1 = store.createSource({
      domain: "exchange-a.com",
      url: "https://exchange-a.com/btc",
      title: "exchange a",
      grade: "A",
      independenceGroup: "exchange-a"
    });
    const s2 = store.createSource({
      domain: "exchange-b.com",
      url: "https://exchange-b.com/btc",
      title: "exchange b",
      grade: "A",
      independenceGroup: "exchange-b"
    });

    store.createCitation(claim.id, { sourceId: s1.id, url: s1.url });
    store.createCitation(claim.id, { sourceId: s2.id, url: s2.url });

    const status = evaluateClaimEvidence(store, claim.id);
    expect(status.passes).toBe(true);
    expect(status.requiredIndependentSources).toBe(2);
    expect(status.foundIndependentSources).toBe(2);
  });

  it("TC-BE-002 critical claim fails with same independence group", () => {
    const store = new InMemoryStore();
    const post = store.createPost(
      createPostFromTemplate({
        title: "War Brief",
        topic: "world",
        templateType: "daily",
        contentKind: "daily"
      })
    );
    const claim = store.createClaim(post.id, {
      text: "Major strike occurred",
      severity: "critical"
    });
    const s1 = store.createSource({
      domain: "news-one.com",
      url: "https://news-one.com/a",
      title: "news one",
      grade: "A",
      independenceGroup: "wire-1"
    });
    const s2 = store.createSource({
      domain: "news-two.com",
      url: "https://news-two.com/a",
      title: "news two",
      grade: "A",
      independenceGroup: "wire-1"
    });

    store.createCitation(claim.id, { sourceId: s1.id, url: s1.url });
    store.createCitation(claim.id, { sourceId: s2.id, url: s2.url });

    const status = evaluateClaimEvidence(store, claim.id);
    expect(status.passes).toBe(false);
    expect(status.missingIndependentSources).toBe(1);
  });

  it("TC-BE-003 non-critical claim passes with one source", () => {
    const store = new InMemoryStore();
    const post = store.createPost(
      createPostFromTemplate({
        title: "Entertainment Daily",
        topic: "entertainment",
        templateType: "daily",
        contentKind: "daily"
      })
    );
    const claim = store.createClaim(post.id, {
      text: "Agency released an official statement",
      severity: "major"
    });
    const source = store.createSource({
      domain: "agency.example",
      url: "https://agency.example/statement",
      title: "official statement",
      grade: "S",
      independenceGroup: "official"
    });

    store.createCitation(claim.id, { sourceId: source.id, url: source.url });

    const status = evaluateClaimEvidence(store, claim.id);
    expect(status.passes).toBe(true);
    expect(status.requiredIndependentSources).toBe(1);
  });

  it("TC-BE-004 rejects citation mapping for F-grade source", () => {
    const store = new InMemoryStore();
    const post = store.createPost(
      createPostFromTemplate({
        title: "Politics Daily",
        topic: "politics",
        templateType: "daily",
        contentKind: "daily"
      })
    );
    const claim = store.createClaim(post.id, {
      text: "Candidate made a statement",
      severity: "major"
    });
    const forbidden = store.createSource({
      domain: "leak.example",
      url: "https://leak.example/private",
      title: "leak",
      grade: "F",
      independenceGroup: "leak"
    });

    expect(() =>
      store.createCitation(claim.id, { sourceId: forbidden.id, url: forbidden.url })
    ).toThrow("F-grade source cannot be used for citation");
  });

  it("rejects citation mapping when robots policy blocks usage", () => {
    const store = new InMemoryStore();
    const post = store.createPost(
      createPostFromTemplate({
        title: "Policy Test",
        topic: "politics",
        templateType: "daily",
        contentKind: "daily"
      })
    );
    const claim = store.createClaim(post.id, {
      text: "Official record published",
      severity: "major"
    });
    const restricted = store.createSource({
      domain: "restricted.example",
      url: "https://restricted.example/item",
      title: "restricted",
      grade: "A",
      independenceGroup: "restricted",
      robotsAllowed: false
    });

    expect(() =>
      store.createCitation(claim.id, { sourceId: restricted.id, url: restricted.url })
    ).toThrow("robots policy blocks citation usage");
  });

  it("rejects excerpt storage for link_only source", () => {
    const store = new InMemoryStore();
    const post = store.createPost(
      createPostFromTemplate({
        title: "Policy Test 2",
        topic: "world",
        templateType: "daily",
        contentKind: "daily"
      })
    );
    const claim = store.createClaim(post.id, {
      text: "Agency update",
      severity: "major"
    });
    const source = store.createSource({
      domain: "linkonly.example",
      url: "https://linkonly.example/update",
      title: "link-only",
      grade: "A",
      independenceGroup: "link-only",
      allowedUse: "link_only"
    });

    expect(() =>
      store.createCitation(claim.id, {
        sourceId: source.id,
        url: source.url,
        excerpt: "quoted text"
      })
    ).toThrow("link_only source cannot store excerpt text");
  });

  it("TC-BE-005 privacy gate fails for email and phone", () => {
    const store = new InMemoryStore();
    const post = store.createPost(
      createPostFromTemplate({
        title: "Privacy Test",
        topic: "world",
        templateType: "daily",
        contentKind: "daily",
        body:
          "Contact me at test@example.com or +82 10-1234-5678 for details."
      })
    );

    const result = runComplianceChecks(store, post.id);
    const privacy = result.results.find((entry) => entry.gate === "privacy");

    expect(privacy?.status).toBe("fail");
  });

  it("copyright gate fails when quote density is too high", () => {
    const store = new InMemoryStore();
    const post = store.createPost(
      createPostFromTemplate({
        title: "Copy Risk",
        topic: "world",
        templateType: "daily",
        contentKind: "daily",
        body: '"This text is copied." "Another copied quote." "One more quoted part."'
      })
    );

    const result = runComplianceChecks(store, post.id);
    const copyright = result.results.find((entry) => entry.gate === "copyright");

    expect(copyright?.status).toBe("fail");
  });

  it("defamation gate returns manual_review for rumor + person pattern", () => {
    const store = new InMemoryStore();
    const post = store.createPost(
      createPostFromTemplate({
        title: "Rumor Test",
        topic: "entertainment",
        templateType: "daily",
        contentKind: "daily",
        body: "rumor says John Doe is involved."
      })
    );

    const result = runComplianceChecks(store, post.id);
    const defamation = result.results.find((entry) => entry.gate === "defamation");

    expect(defamation?.status).toBe("manual_review");
  });

  it("TC-BE-006 ads gate fails for shocking content", () => {
    const store = new InMemoryStore();
    const post = store.createPost(
      createPostFromTemplate({
        title: "Shock Test",
        topic: "world",
        templateType: "daily",
        contentKind: "daily",
        body: "The article contains graphic violence and gore details."
      })
    );

    const result = runComplianceChecks(store, post.id);
    const ads = result.results.find((entry) => entry.gate === "platform_ads");

    expect(ads?.status).toBe("fail");
  });

  it("TC-BE-007 investment recommendation requires disclaimer", () => {
    const store = new InMemoryStore();
    const post = store.createPost(
      createPostFromTemplate({
        title: "Stock Note",
        topic: "stocks",
        templateType: "daily",
        contentKind: "daily",
        body: "You should buy this stock today for momentum."
      })
    );

    const resultWithoutDisclaimer = runComplianceChecks(store, post.id);
    const investWithout = resultWithoutDisclaimer.results.find(
      (entry) => entry.gate === "investment"
    );
    expect(investWithout?.status).toBe("fail");

    store.updatePost(post.id, {
      body: `You should buy this stock today for momentum. ${INVESTMENT_DISCLAIMER}`
    });

    const resultWithDisclaimer = runComplianceChecks(store, post.id);
    const investWith = resultWithDisclaimer.results.find(
      (entry) => entry.gate === "investment"
    );
    expect(investWith?.status).toBe("pass");
  });

  it("TC-BE-008 template factory creates required sections", () => {
    const daily = createPostFromTemplate({
      title: "Daily",
      topic: "crypto",
      templateType: "daily",
      contentKind: "daily"
    });
    const weekly = createPostFromTemplate({
      title: "Weekly",
      topic: "crypto",
      templateType: "weekly",
      contentKind: "cluster"
    });
    const monthly = createPostFromTemplate({
      title: "Monthly",
      topic: "crypto",
      templateType: "monthly",
      contentKind: "hub"
    });

    expect(daily.sections.map((section) => section.heading)).toEqual([
      "오늘 무슨 일?",
      "왜 중요한가",
      "확인된 팩트",
      "앞으로 체크할 포인트"
    ]);
    expect(weekly.sections.length).toBeGreaterThanOrEqual(4);
    expect(monthly.sections.length).toBeGreaterThanOrEqual(4);
  });

  it("TC-BE-009 internal links stay inside recommended bounds", () => {
    const store = new InMemoryStore();
    const target = store.createPost(
      createPostFromTemplate({
        title: "Target Daily",
        topic: "crypto",
        templateType: "daily",
        contentKind: "daily"
      })
    );
    store.createPost(
      createPostFromTemplate({
        title: "Crypto Hub",
        topic: "crypto",
        templateType: "monthly",
        contentKind: "hub"
      })
    );
    store.createPost(
      createPostFromTemplate({
        title: "Cluster One",
        topic: "crypto",
        templateType: "weekly",
        contentKind: "cluster"
      })
    );
    store.createPost(
      createPostFromTemplate({
        title: "Cluster Two",
        topic: "crypto",
        templateType: "weekly",
        contentKind: "cluster"
      })
    );
    store.createPost(
      createPostFromTemplate({
        title: "Old Daily",
        topic: "crypto",
        templateType: "daily",
        contentKind: "daily"
      })
    );

    const recommendation = recommendInternalLinks(store, target.id, DEFAULT_LINK_BOUNDS);

    expect(recommendation.counts.hub).toBeGreaterThanOrEqual(DEFAULT_LINK_BOUNDS.minHub);
    expect(recommendation.counts.hub).toBeLessThanOrEqual(DEFAULT_LINK_BOUNDS.maxHub);
    expect(recommendation.counts.cluster).toBeGreaterThanOrEqual(
      DEFAULT_LINK_BOUNDS.minCluster
    );
    expect(recommendation.counts.cluster).toBeLessThanOrEqual(
      DEFAULT_LINK_BOUNDS.maxCluster
    );
    expect(recommendation.counts.daily).toBeLessThanOrEqual(DEFAULT_LINK_BOUNDS.maxDaily);
  });

  it("TC-BE-010 takedown transition only allows valid sequence", () => {
    const takedown = createTakedownCase("post-1", "copyright");
    const reviewed = applyTakedownTransition(takedown, "in_review");
    const approved = applyTakedownTransition(reviewed, "approved");
    const removed = applyTakedownTransition(approved, "removed");

    expect(removed.state).toBe("removed");
    expect(() => applyTakedownTransition(removed, "approved")).toThrow(
      "Invalid takedown transition"
    );
  });
});
