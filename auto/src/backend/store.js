import crypto from "node:crypto";

/**
 * In-memory store used by domain services and the HTTP API.
 * This intentionally keeps things simple for the kata.
 */
export class InMemoryStore {
  constructor() {
    /** @type {Map<string, any>} */
    this.posts = new Map();
    /** @type {Map<string, any>} */
    this.claims = new Map();
    /** @type {Map<string, any>} */
    this.sources = new Map();
    /** @type {Map<string, any>} */
    this.citations = new Map();
    /** @type {Map<string, any>} */
    this.takedowns = new Map();
    /** @type {Map<string, any>} */
    this.complianceRuns = new Map();

    /** @type {string | null} */
    this.latestDraftPostId = null;
    /** @type {string | null} */
    this.latestSelectedTopic = null;
  }

  /**
   * @param {any} postInput
   */
  createPost(postInput) {
    const id = postInput.id ?? `p_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const post = {
      id,
      title: postInput.title,
      topic: postInput.topic,
      templateType: postInput.templateType,
      contentKind: postInput.contentKind,
      body: postInput.body ?? "",
      sections: postInput.sections ?? [],
      status: postInput.status ?? "draft",
      schedule: postInput.schedule ?? null,
      createdAt: postInput.createdAt ?? now,
      updatedAt: postInput.updatedAt ?? now
    };
    this.posts.set(id, post);
    return post;
  }

  /**
   * @param {string} postId
   */
  getPost(postId) {
    return this.posts.get(postId);
  }

  /**
   * @param {string} postId
   * @param {any} patch
   */
  updatePost(postId, patch) {
    const existing = this.posts.get(postId);
    if (!existing) throw new Error(`Post not found: ${postId}`);
    const updated = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    this.posts.set(postId, updated);
    return updated;
  }

  /**
   * @param {string} postId
   * @param {{ text: string; severity: string }} input
   */
  createClaim(postId, input) {
    if (!this.posts.has(postId)) throw new Error(`Post not found: ${postId}`);
    const id = `c_${crypto.randomUUID()}`;
    const claim = {
      id,
      postId,
      text: input.text,
      severity: input.severity,
      createdAt: new Date().toISOString()
    };
    this.claims.set(id, claim);
    return claim;
  }

  /**
   * @param {string} claimId
   */
  getClaim(claimId) {
    return this.claims.get(claimId);
  }

  /**
   * @param {string} postId
   */
  listClaimsByPost(postId) {
    return Array.from(this.claims.values()).filter((c) => c.postId === postId);
  }

  /**
   * @param {any} input
   */
  createSource(input) {
    const id = input.id ?? `s_${crypto.randomUUID()}`;
    const source = {
      id,
      domain: input.domain,
      url: input.url,
      title: input.title,
      grade: input.grade,
      independenceGroup: input.independenceGroup,
      robotsAllowed: input.robotsAllowed ?? true,
      allowedUse: input.allowedUse ?? "excerpt_allowed",
      createdAt: new Date().toISOString()
    };
    this.sources.set(id, source);
    return source;
  }

  /**
   * @param {string} sourceId
   */
  getSource(sourceId) {
    return this.sources.get(sourceId);
  }

  /**
   * @param {string} claimId
   * @param {{ sourceId: string; url: string; excerpt?: string }} input
   */
  createCitation(claimId, input) {
    const claim = this.claims.get(claimId);
    if (!claim) throw new Error(`Claim not found: ${claimId}`);
    const source = this.sources.get(input.sourceId);
    if (!source) throw new Error(`Source not found: ${input.sourceId}`);

    if (source.grade === "F") {
      throw new Error("F-grade source cannot be used for citation");
    }
    if (source.robotsAllowed === false) {
      throw new Error("robots policy blocks citation usage");
    }
    if (source.allowedUse === "link_only" && typeof input.excerpt === "string") {
      throw new Error("link_only source cannot store excerpt text");
    }

    const id = `ct_${crypto.randomUUID()}`;
    const citation = {
      id,
      claimId,
      sourceId: input.sourceId,
      url: input.url,
      excerpt: input.excerpt,
      createdAt: new Date().toISOString()
    };
    this.citations.set(id, citation);
    return citation;
  }

  /**
   * @param {string} claimId
   */
  listCitationsByClaim(claimId) {
    return Array.from(this.citations.values()).filter((c) => c.claimId === claimId);
  }

  /**
   * @param {{ postId: string; reason: string; state?: string; previousPostStatus?: string }} input
   */
  createTakedown(input) {
    const id = `td_${crypto.randomUUID()}`;
    const takedown = {
      id,
      postId: input.postId,
      reason: input.reason,
      state: input.state ?? "requested",
      previousPostStatus: input.previousPostStatus,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.takedowns.set(id, takedown);
    return takedown;
  }

  /**
   * @param {string} takedownId
   */
  getTakedown(takedownId) {
    return this.takedowns.get(takedownId);
  }

  /**
   * @param {string} postId
   */
  listTakedownsByPost(postId) {
    return Array.from(this.takedowns.values()).filter((t) => t.postId === postId);
  }

  /**
   * @param {string} postId
   * @param {any} complianceRun
   */
  saveComplianceRun(postId, complianceRun) {
    this.complianceRuns.set(postId, {
      ...complianceRun,
      postId,
      ranAt: new Date().toISOString()
    });
    return this.complianceRuns.get(postId);
  }

  /**
   * @param {string} postId
   */
  getComplianceRun(postId) {
    return this.complianceRuns.get(postId);
  }

  /**
   * Removes a post and its dependent records.
   * @param {string} postId
   */
  removePost(postId) {
    this.posts.delete(postId);
    for (const claim of this.listClaimsByPost(postId)) {
      this.claims.delete(claim.id);
      for (const citation of this.listCitationsByClaim(claim.id)) {
        this.citations.delete(citation.id);
      }
    }
    // takedowns
    for (const td of this.listTakedownsByPost(postId)) {
      this.takedowns.delete(td.id);
    }
    this.complianceRuns.delete(postId);

    if (this.latestDraftPostId === postId) this.latestDraftPostId = null;
  }
}
