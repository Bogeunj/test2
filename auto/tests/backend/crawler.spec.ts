import { describe, expect, it, vi } from "vitest";

import {
  buildTodayDraft,
  crawlAndDraftTodayPost,
  parseRssItems,
  topicToRssUrl
} from "../../src/backend/services/crawler.js";
import type { DraftTopic } from "../../src/shared/types.js";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title><![CDATA[Bitcoin rises 3%]]></title>
      <link>https://news.example/crypto/1</link>
      <pubDate>Tue, 03 Mar 2026 08:00:00 GMT</pubDate>
      <description><![CDATA[Bitcoin climbed as risk appetite improved. Traders reacted to ETF flows.]]></description>
      <source url="https://news.example">News Example</source>
    </item>
    <item>
      <title><![CDATA[ETF flows turn positive]]></title>
      <link>https://finance.example/crypto/2</link>
      <pubDate>Tue, 03 Mar 2026 09:00:00 GMT</pubDate>
      <description><![CDATA[Institutional inflows increased for a second day. Analysts flagged volatility.]]></description>
      <source url="https://finance.example">Finance Example</source>
    </item>
  </channel>
</rss>`;

describe("crawler service", () => {
  it("TC-F2-BE-001 parses RSS items into normalized fields", () => {
    const items = parseRssItems(SAMPLE_RSS);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Bitcoin rises 3%",
      url: "https://news.example/crypto/1",
      publishedAt: "2026-03-03T08:00:00.000Z",
      source: "News Example"
    });
    expect(items[0].snippet).toContain("Bitcoin climbed");
  });

  it("TC-F2-BE-002 builds today draft body from crawled items", () => {
    const items = parseRssItems(SAMPLE_RSS);
    const draft = buildTodayDraft("market:crypto:bitcoin", items, "2026-03-03T10:00:00.000Z");

    expect(draft.title).toContain("비트코인");
    expect(draft.body).toContain("## 1. [제목] Bitcoin rises 3%");
    expect(draft.body).toContain("결론:");
    expect(draft.body).toContain("Bitcoin rises 3%");
    expect(draft.sources).toHaveLength(2);
    expect(draft.entries).toHaveLength(2);
    expect(draft.entries[0].bullets).toHaveLength(3);
  });

  it("TC-UX2-CRAWL-001 keeps 3 bullets per source entry", () => {
    const draft = buildTodayDraft("market:crypto:bitcoin", parseRssItems(SAMPLE_RSS), "2026-03-03T10:00:00.000Z");

    expect(draft.entries[0].bullets[0].length).toBeGreaterThan(5);
    expect(draft.entries[0].bullets[1].length).toBeGreaterThan(5);
    expect(draft.entries[0].bullets[2].length).toBeGreaterThan(5);
  });

  it("TC-UX2-CRAWL-002 removes '보도는' phrase from conclusion", () => {
    const draft = buildTodayDraft("market:crypto:bitcoin", parseRssItems(SAMPLE_RSS), "2026-03-03T10:00:00.000Z");

    expect(draft.entries[0].conclusion.includes("보도는")).toBe(false);
  });

  it("crawls topic RSS and generates draft with mocked fetcher", async () => {
    const fetcher = async (url: string): Promise<string> => {
      expect(url).toBe(topicToRssUrl("market:stocks:us"));
      return SAMPLE_RSS;
    };

    const draft = await crawlAndDraftTodayPost(
      "market:stocks:us",
      fetcher,
      "2026-03-03T10:00:00.000Z"
    );

    expect(draft.topic).toBe("market:stocks:us");
    expect(draft.title).toContain("미국 증시");
  });

  it("throws on unsupported topic", async () => {
    const fetcher = async (): Promise<string> => SAMPLE_RSS;

    await expect(
      crawlAndDraftTodayPost("invalid-topic" as DraftTopic, fetcher, "2026-03-03T10:00:00.000Z")
    ).rejects.toThrow("Unsupported topic");
  });

  it("TC-UX3-CRAWL-001 passes article text to summarizer and applies generated entry fields", async () => {
    const articleFetcher = vi.fn(async (url: string): Promise<string> => `원문 본문: ${url} 관련 세부 내용`);
    const summarizer = vi.fn(
      async (input: {
        topic: DraftTopic;
        item: {
          title: string;
          url: string;
          source: string;
          publishedAt: string;
          snippet?: string;
          articleText?: string;
        };
      }) => ({
        sourceTitle: `[AI] ${input.item.title}`,
        bullets: ["요약 첫 줄", "요약 둘째 줄", "요약 셋째 줄"] as [string, string, string],
        conclusion: "원문 기반 결론"
      })
    );

    const draft = await (crawlAndDraftTodayPost as unknown as (
      topic: DraftTopic,
      fetcher: (url: string) => Promise<string>,
      nowIso: string,
      options?: {
        articleFetcher?: (url: string) => Promise<string | undefined>;
        summarizer?: (input: {
          topic: DraftTopic;
          item: {
            title: string;
            url: string;
            source: string;
            publishedAt: string;
            snippet?: string;
            articleText?: string;
          };
        }) => Promise<{ sourceTitle: string; bullets: [string, string, string]; conclusion: string }>;
      }
    ) => Promise<ReturnType<typeof buildTodayDraft>>)(
      "market:crypto:bitcoin",
      async () => SAMPLE_RSS,
      "2026-03-03T10:00:00.000Z",
      { articleFetcher, summarizer }
    );

    expect(articleFetcher).toHaveBeenCalledTimes(2);
    expect(summarizer).toHaveBeenCalledTimes(2);
    expect(summarizer.mock.calls[0]?.[0].item.articleText).toContain("원문 본문");
    expect(draft.entries[0].sourceTitle).toContain("[AI]");
    expect(draft.entries[0].bullets).toEqual(["요약 첫 줄", "요약 둘째 줄", "요약 셋째 줄"]);
    expect(draft.entries[0].conclusion).toBe("원문 기반 결론");
  });

  it("TC-UX3-CRAWL-002 does not persist '핵심 이슈:' prefix in bullets", () => {
    const draft = buildTodayDraft(
      "market:crypto:bitcoin",
      parseRssItems(SAMPLE_RSS),
      "2026-03-03T10:00:00.000Z"
    );

    expect(
      draft.entries.every((entry) => entry.bullets.every((bullet) => !bullet.includes("핵심 이슈:")))
    ).toBe(true);
  });

  it("TC-UX3-CRAWL-003 falls back to default summary when summarizer fails", async () => {
    const articleFetcher = vi.fn(async (url: string): Promise<string> => `원문 본문: ${url}`);
    const summarizer = vi.fn(async () => {
      throw new Error("LLM timeout");
    });

    const draft = await (crawlAndDraftTodayPost as unknown as (
      topic: DraftTopic,
      fetcher: (url: string) => Promise<string>,
      nowIso: string,
      options?: {
        articleFetcher?: (url: string) => Promise<string | undefined>;
        summarizer?: (input: unknown) => Promise<unknown>;
      }
    ) => Promise<ReturnType<typeof buildTodayDraft>>)(
      "market:crypto:bitcoin",
      async () => SAMPLE_RSS,
      "2026-03-03T10:00:00.000Z",
      { articleFetcher, summarizer }
    );

    expect(summarizer).toHaveBeenCalled();
    expect(draft.entries[0]?.bullets[0].length).toBeGreaterThan(0);
    expect(draft.entries[0]?.conclusion.length).toBeGreaterThan(0);
  });

  it("TC-UX3-CRAWL-004 uses AI title generator output for draft title", async () => {
    const draftTitleGenerator = vi.fn(
      async () => "비트코인 ETF 자금 흐름과 단기 변동성 체크"
    );

    const draft = await (crawlAndDraftTodayPost as unknown as (
      topic: DraftTopic,
      fetcher: (url: string) => Promise<string>,
      nowIso: string,
      options?: {
        draftTitleGenerator?: (input: {
          topic: DraftTopic;
          date: string;
          items: {
            title: string;
            snippet?: string;
            articleText?: string;
          }[];
        }) => Promise<string>;
      }
    ) => Promise<ReturnType<typeof buildTodayDraft>>)(
      "market:crypto:bitcoin",
      async () => SAMPLE_RSS,
      "2026-03-03T10:00:00.000Z",
      { draftTitleGenerator }
    );

    expect(draftTitleGenerator).toHaveBeenCalledTimes(1);
    expect(draft.title).toBe("[2026-03-03] 비트코인 ETF 자금 흐름과 단기 변동성 체크");
  });
});
