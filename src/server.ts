#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

type HttpClient = (input: string, init?: RequestInit) => Promise<Response>;

interface EnvConfig {
  baseUrl: string;
  token?: string;
}

function getEnv(): EnvConfig {
  const baseUrl = process.env.MINIFLUX_BASE_URL || "";
  const token = process.env.MINIFLUX_TOKEN || undefined;
  if (!baseUrl) {
    throw new Error("MINIFLUX_BASE_URL is required");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

function createHttpClient(): HttpClient {
  // Node >= 18 has global fetch
  const http: HttpClient = async (input, init = {}) => {
    return fetch(input, init);
  };
  return http;
}

async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  const { baseUrl, token } = getEnv();
  const url = `${baseUrl}${path}`;
  const headers = new Headers(init?.headers || {});
  if (token) headers.set("X-Auth-Token", token);
  headers.set("accept", "application/json");
  const http = createHttpClient();
  return http(url, { ...init, headers });
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// Schemas (partial)
interface Category { id: number; title: string }
interface Feed { id: number; title: string; site_url?: string | null; feed_url?: string | null }
interface EntriesResponse { total: number; entries: unknown[] }

// String normalization helpers for robust matching
function stripDiacritics(input: string): string {
  return input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function toLower(input: string): string {
  return stripDiacritics(input).toLowerCase();
}

function collapseNonAlnum(input: string): string {
  return toLower(input).replace(/[^a-z0-9]/gi, "");
}

function tokenizeAlnum(input: string): string[] {
  return toLower(input)
    .split(/[^a-z0-9]+/gi)
    .filter((token) => token.length > 0);
}

function tokensAreSubset(queryTokens: string[], targetTokens: string[]): boolean {
  if (queryTokens.length === 0) return false;
  const targetSet = new Set(targetTokens);
  return queryTokens.every((token) => targetSet.has(token));
}

function toUnixSeconds(input: unknown): number | undefined {
  if (input == null) return undefined;
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.floor(input > 1e12 ? input / 1000 : input);
  }
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return undefined;
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      if (!Number.isFinite(n)) return undefined;
      return Math.floor(n > 1e12 ? n / 1000 : n);
    }
    const ms = Date.parse(s);
    if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
  }
  return undefined;
}

const server = new McpServer({ name: "miniflux-mcp", version: "1.0.0" });

// listCategories
server.registerTool(
  "listCategories",
  {
    title: "List Miniflux Categories",
    description:
      "Lists all available Miniflux categories for browsing.",
    inputSchema: {
      counts: z
        .boolean()
        .optional()
        .describe(
          "If true, include unread and feed counts for each category (since Miniflux 2.0.46)."
        ),
    },
  },
  async ({ counts }) => {
    const path = counts ? `/v1/categories?counts=true` : `/v1/categories`;
    const res = await apiRequest(path);
    const categories = await json<Category[]>(res);
    return { content: [{ type: "text", text: JSON.stringify({ categories }) }] };
  }
);



// searchFeedsByCategory
server.registerTool(
  "searchFeedsByCategory",
  {
    title: "Search Feeds by Category",
    description: "Search for feeds within a specific Miniflux category.",
    inputSchema: {
      category_id: z
        .number()
        .describe(
          "Numeric ID of the category."
        ),
      query: z
        .string()
        .optional()
        .describe(
          "A search term to filter feeds by title, site URL, or feed URL (case-insensitive)."
        ),
    },
  },
  async ({ category_id, query }) => {
  const res = await apiRequest(`/v1/categories/${category_id}/feeds`);
  const feeds = await json<Feed[]>(res);
    if (!query) return { content: [{ type: "text", text: JSON.stringify({ feeds }) }] };
  const q = query.toLowerCase();
  const filtered = feeds.filter(f =>
    (f.title || "").toLowerCase().includes(q) ||
    (f.site_url || "").toLowerCase().includes(q) ||
    (f.feed_url || "").toLowerCase().includes(q)
  );
    return { content: [{ type: "text", text: JSON.stringify({ feeds: filtered }) }] };
  }
);

// getFeedDetails
server.registerTool(
  "getFeedDetails",
  {
    title: "Get Feed Details",
    description: "Get details for a single Miniflux feed.",
    inputSchema: {
      feed_id: z
        .number()
        .describe(
          "Numeric ID of the feed."
        ),
    },
  },
  async ({ feed_id }) => {
  const res = await apiRequest(`/v1/feeds/${feed_id}`);
  const feed = await json<Feed>(res);
    return { content: [{ type: "text", text: JSON.stringify({ feed }) }] };
  }
);

// listFeeds
server.registerTool(
  "listFeeds",
  {
    title: "List All Feeds",
    description:
      "Lists all feeds for the authenticated user.",
    inputSchema: {},
  },
  async () => {
    const res = await apiRequest(`/v1/feeds`);
    const feeds = await json<any[]>(res);
    const mapped = feeds.map(f => ({
      id: f.id,
      user_id: f.user_id ?? null,
      site_url: f.site_url ?? null,
      title: f.title,
      category: f.category ? { id: f.category.id, title: f.category.title } : null
    }));
    return { content: [{ type: "text", text: JSON.stringify({ feeds: mapped }) }] };
  }
);

// searchEntries (global/category/feed)
server.registerTool(
  "searchEntries",
  {
    title: "Search Entries",
    description:
      "Searches for entries (articles). Can be global (using the `search` parameter for full-text search) or scoped by a specific source (using `category_id` or `feed_id`). The `search` parameter expects a single keyword or phrase; it does not support boolean operators like 'OR' or 'AND'. IMPORTANT: If a global search for an ambiguous term (e.g., `search: 'tech product'`) returns no results, consider the possibility that the user was trying to name a source, not search for a keyword. In that case, ask for clarification: 'Are you trying to search for articles containing the text 'tech product', or is that the name of a category or feed you want to see articles from?' This provides a fallback if the initial interpretation was incorrect.",
    inputSchema: {
      category_id: z
        .number()
        .optional()
        .describe("Numeric ID of the category to scope search to."),
      feed_id: z
        .number()
        .optional()
        .describe("Numeric ID of the feed to scope search to."),
      search: z
        .string()
        .optional()
        .describe("A text query to search for in the entry's title and content."),
      status: z
        .string()
        .optional()
        .describe(
          "Filter entries by status. Use comma-separated values for multiple statuses (e.g., 'read,unread')."
        ),
      starred: z
        .boolean()
        .optional()
        .describe("Filter by bookmarked (starred) status."),
      limit: z.number().optional().describe("Maximum number of entries to return."),
      offset: z.number().optional().describe("Number of entries to skip for pagination."),
      order: z
        .enum(["id", "status", "published_at", "category_title", "category_id"])
        .optional()
        .describe("Field to sort entries by."),
      direction: z
        .enum(["asc", "desc"])
        .optional()
        .describe("Sorting direction: 'asc' or 'desc'."),
      before: z
        .string()
        .optional()
        .describe("Unix timestamp or datetime string (YYYY-MM-DD or ISO) to get entries created before this time."),
      after: z
        .string()
        .optional()
        .describe("Unix timestamp or datetime string (YYYY-MM-DD or ISO) to get entries created after this time."),
      published_before: z
        .string()
        .optional()
        .describe(
          "Unix timestamp or datetime string (YYYY-MM-DD or ISO) to get entries published before this time."
        ),
      published_after: z
        .string()
        .optional()
        .describe("Unix timestamp or datetime string (YYYY-MM-DD or ISO) to get entries published after this time."),
      changed_before: z
        .string()
        .optional()
        .describe("Unix timestamp or datetime string (YYYY-MM-DD or ISO) to get entries changed before this time."),
      changed_after: z
        .string()
        .optional()
        .describe("Unix timestamp or datetime string (YYYY-MM-DD or ISO) to get entries changed after this time."),
      before_entry_id: z
        .number()
        .optional()
        .describe(
          "For cursor-based pagination, get entries older than this entry ID."
        ),
      after_entry_id: z
        .number()
        .optional()
        .describe(
          "For cursor-based pagination, get entries newer than this entry ID."
        ),
    },
  },
  async (args) => {
  const params = new URLSearchParams();
  if (args.search) params.set("search", args.search);
  if (args.status) {
    const statuses = args.status.split(',').map(s => s.trim()).filter(s => ['read', 'unread', 'removed'].includes(s));
    for (const s of statuses) params.append("status", s);
  }
  if (typeof args.starred === "boolean") params.set("starred", String(args.starred));
  if (args.offset != null) params.set("offset", String(args.offset));
  const limitValue = typeof args.limit === "number" && args.limit > 0 ? args.limit : 20;
  params.set("limit", String(limitValue));
  if (args.order) {
    params.set("order", args.order);
  } else {
    params.set("order", "published_at");
  }
  if (args.direction) {
    params.set("direction", args.direction);
  } else {
    params.set("direction", "desc");
  }
  const beforeTs = toUnixSeconds(args.before);
  if (beforeTs != null) params.set("before", String(beforeTs));
  const afterTs = toUnixSeconds(args.after);
  if (afterTs != null) params.set("after", String(afterTs));
  const pbTs = toUnixSeconds(args.published_before);
  if (pbTs != null) params.set("published_before", String(pbTs));
  const paTs = toUnixSeconds(args.published_after);
  if (paTs != null) params.set("published_after", String(paTs));
  const cbTs = toUnixSeconds(args.changed_before);
  if (cbTs != null) params.set("changed_before", String(cbTs));
  const caTs = toUnixSeconds(args.changed_after);
  if (caTs != null) params.set("changed_after", String(caTs));
  if (args.before_entry_id != null) params.set("before_entry_id", String(args.before_entry_id));
  if (args.after_entry_id != null) params.set("after_entry_id", String(args.after_entry_id));

  let path = "/v1/entries";
  if (args.category_id != null && args.feed_id == null) {
    path = `/v1/categories/${args.category_id}/entries`;
  } else if (args.feed_id != null && args.category_id == null) {
    path = `/v1/feeds/${args.feed_id}/entries`;
  }

    const qs = params.toString();
    const res = await apiRequest(`${path}${qs ? `?${qs}` : ""}`);
    const data = await json<EntriesResponse>(res);
    const limitNum = typeof args.limit === "number" && args.limit > 0 ? args.limit : 20;
    const offsetNum = typeof args.offset === "number" && args.offset > 0 ? args.offset : 0;
    const count = Array.isArray((data as any).entries) ? (data as any).entries.length : 0;
    const has_more = offsetNum + count < (data as any).total;
    const next_offset = has_more ? offsetNum + count : null;
    return { content: [{ type: "text", text: JSON.stringify({ total: data.total, entries: data.entries, limit: limitNum, offset: offsetNum, next_offset, has_more }) }] };
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


