import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * @typedef {import('../../shared/types.js').TodayDraft} TodayDraft
 */

/**
 * @typedef {{
 *  id: string;
 *  title: string;
 *  categoryKey: string;
 *  categoryLabel: string;
 *  topic: string;
 *  topicLabel: string;
 *  createdAt: string;
 *  updatedAt: string;
 *  status: string;
 *  draft: TodayDraft;
 * }} PersistedBriefing
 */

/**
 * @param {string} rootDir
 */
export function createBriefingArchive(rootDir) {
  async function ensureDir() {
    await mkdir(rootDir, { recursive: true });
  }

  /**
   * @param {PersistedBriefing} briefing
   */
  async function save(briefing) {
    await ensureDir();
    const filePath = join(rootDir, `${briefing.id}.json`);
    await writeFile(filePath, JSON.stringify(briefing, null, 2), "utf8");
  }

  /**
   * @returns {Promise<PersistedBriefing[]>}
   */
  async function list() {
    try {
      await ensureDir();
      const files = (await readdir(rootDir)).filter((f) => f.endsWith(".json"));
      files.sort();
      const records = [];
      for (const file of files) {
        const raw = await readFile(join(rootDir, file), "utf8");
        try {
          records.push(JSON.parse(raw));
        } catch {
          // ignore corrupt record
        }
      }
      return records;
    } catch {
      return [];
    }
  }

  /**
   * @param {string} id
   */
  async function remove(id) {
    await ensureDir();
    await rm(join(rootDir, `${id}.json`), { force: true });
  }

  return { save, list, remove, rootDir };
}
