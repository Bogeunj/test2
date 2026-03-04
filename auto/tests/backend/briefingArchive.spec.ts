import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createBriefingArchive,
  type PersistedBriefing
} from "../../src/backend/services/briefingArchive.js";

const buildFixture = (id: string): PersistedBriefing => ({
  id,
  title: `[2026-03-03] 테스트 브리핑 ${id}`,
  categoryKey: "market",
  categoryLabel: "시장",
  topic: "market:crypto:bitcoin",
  topicLabel: "비트코인",
  createdAt: "2026-03-03T00:00:00.000Z",
  updatedAt: "2026-03-03T00:00:00.000Z",
  status: "draft",
  draft: {
    topic: "market:crypto:bitcoin",
    title: `[2026-03-03] 테스트 브리핑 ${id}`,
    categoryKey: "market",
    categoryLabel: "시장",
    topicLabel: "비트코인",
    body: "본문",
    createdAt: "2026-03-03T00:00:00.000Z",
    sources: [],
    entries: []
  }
});

describe("briefing archive", () => {
  const cleanupTargets: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanupTargets.splice(0).map((target) => rm(target, { recursive: true, force: true })));
  });

  it("TC-UX2-BE-001 stores briefing JSON file and lists records", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "briefing-archive-"));
    cleanupTargets.push(tempRoot);

    const archive = createBriefingArchive(tempRoot);
    await archive.save(buildFixture("bf_1"));
    await archive.save(buildFixture("bf_2"));

    const listed = await archive.list();
    expect(listed).toHaveLength(2);
    expect(listed[0].id).toBe("bf_1");

    const raw = await readFile(join(tempRoot, "bf_1.json"), "utf8");
    expect(raw).toContain("테스트 브리핑 bf_1");
  });

  it("TC-UX2-BE-002 deletes persisted briefing file", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "briefing-archive-"));
    cleanupTargets.push(tempRoot);

    const archive = createBriefingArchive(tempRoot);
    await archive.save(buildFixture("bf_delete"));
    await archive.remove("bf_delete");

    const listed = await archive.list();
    expect(listed).toHaveLength(0);
  });
});
