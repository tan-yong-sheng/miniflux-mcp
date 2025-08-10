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

const server = new McpServer({ name: "miniflux-mcp", version: "1.0.0" });

// listCategories
server.registerTool(
  "listCategories",
  {
    title: "List Miniflux Categories",
    description: "List all available Miniflux categories.",
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

// resolveCategoryId
server.registerTool(
  "resolveCategoryId",
  {
    title: "Resolve Category ID",
    description:
      "Resolves a category name to its numeric ID. Call this tool when a user mentions a category by name and you need its ID for another tool, like `searchFeedsByCategory` or `searchEntries`. For ambiguous queries where a name could be a category OR a feed (e.g., 'show me posts from \"Tech Stuff\"'), use this tool first to check if a matching category exists. If it returns an ID, you can proceed with category-scoped tools. If not, the name might refer to a feed.",
    inputSchema: {
      category_name: z
        .string()
        .describe("The name of the category to resolve."),
    },
  },
  async ({ category_name }) => {
  const res = await apiRequest(`/v1/categories`);
  const categories = await json<Category[]>(res);
  const exact = categories.find(c => c.title === category_name);
    if (exact) return { content: [{ type: "text", text: JSON.stringify({ category_id: exact.id }) }] };
  const ciExact = categories.find(c => c.title.toLowerCase() === category_name.toLowerCase());
    if (ciExact) return { content: [{ type: "text", text: JSON.stringify({ category_id: ciExact.id }) }] };
  const partial = categories.filter(c => c.title.toLowerCase().includes(category_name.toLowerCase()));
    if (partial.length === 1) return { content: [{ type: "text", text: JSON.stringify({ category_id: partial[0].id }) }] };
    if (partial.length > 1) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "AMBIGUOUS_CATEGORY", candidates: partial.map(c => ({ id: c.id, title: c.title })) }) }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify({ error: "CATEGORY_NOT_FOUND" }) }], isError: true };
  }
);

// resolveFeedId
server.registerTool(
  "resolveFeedId",
  {
    title: "Resolve Feed ID",
    description:
      "Resolves a feed's name or URL to its numeric ID by searching across all feeds. This tool should be used after an ambiguous query (e.g., \"search for 'Tech Weekly'\") has been tried with `resolveCategoryId` and failed. If `resolveCategoryId` returns `CATEGORY_NOT_FOUND`, you should call this tool to check if the user's query matches a feed title or URL.",
    inputSchema: {
      feed_query: z
        .string()
        .describe(
          "Feed title or URL (site_url or feed_url). Exact, case-insensitive, and partial matches are attempted in this order."
        ),
    },
  },
  async ({ feed_query }) => {
    const res = await apiRequest(`/v1/feeds`);
    const feeds = await json<Feed[]>(res);

    const q = feed_query.trim().toLowerCase();

    // Exact (case-sensitive) title match
    const exactTitle = feeds.find((f) => (f.title || "") === feed_query);
    if (exactTitle) {
      return {
        content: [
          { type: "text", text: JSON.stringify({ feed_id: exactTitle.id }) },
        ],
      };
    }

    // Case-insensitive equality checks (title, site_url, feed_url)
    const ciEquals = feeds.find(
      (f) =>
        (f.title || "").toLowerCase() === q ||
        (f.site_url || "").toLowerCase() === q ||
        (f.feed_url || "").toLowerCase() === q
    );
    if (ciEquals) {
      return {
        content: [
          { type: "text", text: JSON.stringify({ feed_id: ciEquals.id }) },
        ],
      };
    }

    // Partial matches across title, site_url, feed_url
    const partial = feeds.filter(
      (f) =>
        (f.title || "").toLowerCase().includes(q) ||
        (f.site_url || "").toLowerCase().includes(q) ||
        (f.feed_url || "").toLowerCase().includes(q)
    );

    if (partial.length === 1) {
      return {
        content: [
          { type: "text", text: JSON.stringify({ feed_id: partial[0].id }) },
        ],
      };
    }

    if (partial.length > 1) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "AMBIGUOUS_FEED",
              candidates: partial.map((f) => ({
                id: f.id,
                title: f.title,
                site_url: f.site_url,
                feed_url: f.feed_url,
              })),
            }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        { type: "text", text: JSON.stringify({ error: "FEED_NOT_FOUND" }) },
      ],
      isError: true,
    };
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
          "Numeric ID of the category. You must use `resolveCategoryId` to get this value if the user provides a category name instead of an ID."
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
          "Numeric ID of the feed. If you only have the feed's name, you must use `resolveFeedId` to get the numeric feed ID."
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
      "Lists all feeds for the authenticated user using the Miniflux `/v1/feeds` endpoint. Use this to browse feeds or to help identify a feed before calling `getFeedDetails`.",
    inputSchema: {},
  },
  async () => {
    const res = await apiRequest(`/v1/feeds`);
    const feeds = await json<Feed[]>(res);
    return { content: [{ type: "text", text: JSON.stringify({ feeds }) }] };
  }
);

// searchEntries (global/category/feed)
server.registerTool(
  "searchEntries",
  {
    title: "Search Entries",
    description:
      "Searches for entries (articles). Can be global or scoped by category, feed, or both. For scoped searches, you MUST provide the numeric ID for the category or feed. Use `resolveCategoryId` to find category IDs and `resolveFeedId` to find feed IDs from user-provided names.",
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
        .array(z.enum(["read", "unread", "removed"]))
        .optional()
        .describe(
          "Filter entries by status. Provide an array for multiple statuses."
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
        .number()
        .optional()
        .describe("Unix timestamp to get entries created before this time."),
      after: z
        .number()
        .optional()
        .describe("Unix timestamp to get entries created after this time."),
      published_before: z
        .number()
        .optional()
        .describe(
          "Unix timestamp to get entries published before this time."
        ),
      published_after: z
        .number()
        .optional()
        .describe("Unix timestamp to get entries published after this time."),
      changed_before: z
        .number()
        .optional()
        .describe("Unix timestamp to get entries changed before this time."),
      changed_after: z
        .number()
        .optional()
        .describe("Unix timestamp to get entries changed after this time."),
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
  if (args.status && Array.isArray(args.status)) for (const s of args.status) params.append("status", s);
  if (typeof args.starred === "boolean") params.set("starred", String(args.starred));
  if (args.offset != null) params.set("offset", String(args.offset));
  if (args.limit != null) params.set("limit", String(args.limit));
  if (args.order) params.set("order", args.order);
  if (args.direction) params.set("direction", args.direction);
  if (args.before != null) params.set("before", String(args.before));
  if (args.after != null) params.set("after", String(args.after));
  if (args.published_before != null) params.set("published_before", String(args.published_before));
  if (args.published_after != null) params.set("published_after", String(args.published_after));
  if (args.changed_before != null) params.set("changed_before", String(args.changed_before));
  if (args.changed_after != null) params.set("changed_after", String(args.changed_after));
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
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
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


