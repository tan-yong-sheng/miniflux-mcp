### Miniflux MCP Read-Only Spec

#### Scope
- **Read-only only**: list/search all feeds, resolve category ID by name, list/search feeds within a category, fetch a single feed’s details.
- No write operations are used.

#### MCP Function Mapping and Usage Guidance
- **listCategories(counts?: boolean) -> Category[]**
  - Backed by: `GET /v1/categories` (optional `?counts=true` to include `total_unread` and `feed_count` since 2.0.46)
- **resolveCategoryId(category_name: string) -> number**
  - Backed by: `GET /v1/categories`
  - Behavior: Find category by title. If multiple exact matches exist, return the first; otherwise consider case-insensitive exact match, then case-insensitive partial match. If ambiguous, return a disambiguation error with candidate IDs.
  - Note: Prefer exact title matches. Titles are user-defined and not guaranteed unique.
- **searchFeedsByCategory(category_id: number, query?: string) -> Feed[]**
  - Backed by: `GET /v1/categories/{categoryID}/feeds` with client-side filter.
  - Critical: You must call `resolveCategoryId` first if you only have a category name. Skip if the user explicitly provided a numeric `category_id`.
- **getFeedDetails(feed_id: number) -> Feed**
  - Backed by: `GET /v1/feeds/{feedID}`.
- **searchEntries(...) -> { total: number, entries: Entry[] }**
  - Backed by: `GET /v1/entries`, `/v1/categories/{categoryID}/entries`, `/v1/feeds/{feedID}/entries`.
  - Supports server-side filters: `search`, `status`, `starred`, `offset`, `limit`, `order`, `direction`, `before`, `after`, `published_before`, `published_after`, `changed_before`, `changed_after`, `before_entry_id`, `after_entry_id`.

#### Authentication
- **Preferred**: API Key via header `X-Auth-Token`
- **Alternative**: HTTP Basic.

#### Environment
```bash
export BASE_URL="https://miniflux.example.org"
export TOKEN="REDACTED_API_TOKEN"
```

Test authentication:
```bash
curl -sS -H "X-Auth-Token: $TOKEN" "$BASE_URL/v1/me"
```

### Endpoints Used
- Get Categories: `GET /v1/categories` (optional `?counts=true`)
- Get Category Feeds: `GET /v1/categories/{categoryID}/feeds`
- Get Feed: `GET /v1/feeds/{feedID}`
- Get Entries: `GET /v1/entries`
- Get Category Entries: `GET /v1/categories/{categoryID}/entries`
- Get Feed Entries: `GET /v1/feeds/{feedID}/entries`

Notes:
- Feed search is supported within a category via client-side filtering of `GET /v1/categories/{categoryID}/feeds`.
- For articles (entries), server-side filters exist, including time-window filters via Unix timestamps (see below).

#### Likely User Queries this MCP should support (read-only)
- Resolve a category ID by name, then search feeds in that category.
- Get details for a single feed.
- Search entries (articles) globally, by category, or by feed, with filters:
  - text `search`, `status` (read/unread/removed), `starred`, pagination (`offset`, `limit`), sorting (`order`, `direction`)
  - date ranges using Unix timestamps: `published_after`, `published_before`, `changed_after`, `changed_before`, and generic `before`/`after`.

---

### 1) Resolve Category ID from Category Name
Ref: Get Categories

List categories:
```bash
curl -sS -H "X-Auth-Token: $TOKEN" "$BASE_URL/v1/categories"
```

Resolve a category ID by exact title match (case-sensitive):
```bash
export CATEGORY_NAME="Engineering Blogs"
CATEGORY_ID=$(curl -sS -H "X-Auth-Token: $TOKEN" "$BASE_URL/v1/categories" \
  | jq -r --arg name "$CATEGORY_NAME" '.[] | select(.title == $name) | .id' | head -n1)
echo "$CATEGORY_ID"
```

Usage requirement for MCP implementers:
- If the user provides only a category name (no numeric `category_id`), call your `resolveCategoryId(category_name)` function first and use the returned ID for subsequent category-scoped operations (such as `searchFeedsByCategory`). If multiple or no matches are found, surface a clear error or disambiguation prompt.

Optional (since 2.0.46): include counters
```bash
curl -sS -H "X-Auth-Token: $TOKEN" "$BASE_URL/v1/categories?counts=true"
```

### 2) Search Feeds in a Specific Category (Client-side Filter)
Ref: Get Category Feeds

Unfiltered list of feeds for a category:
```bash
curl -sS -H "X-Auth-Token: $TOKEN" "$BASE_URL/v1/categories/$CATEGORY_ID/feeds"
```

Filtered by query:
```bash
curl -sS -H "X-Auth-Token: $TOKEN" "$BASE_URL/v1/categories/$CATEGORY_ID/feeds" \
  | jq --arg q "$QUERY" '[
      .[] | select((.title // "" | test($q; "i"))
                   or (.site_url // "" | test($q; "i"))
                   or (.feed_url // "" | test($q; "i")))
    ]'
```

Important flow dependency:
- `searchFeedsByCategory` requires a numeric `category_id`. If your input is a category name, first invoke `resolveCategoryId(category_name)` to obtain the `category_id`. Only skip this step if the user explicitly provided a numeric `category_id`.

### 3) Get Details of a Single Feed
Ref: Get Feed

```bash
export FEED_ID=42
curl -sS -H "X-Auth-Token: $TOKEN" "$BASE_URL/v1/feeds/$FEED_ID"
```

Optional (favicon; returns 404 if none):
```bash
### 4) Search Entries Across All Feeds (Server-side Filters)
Ref: Get Entries

Supported query params (subset):
- `search` (text)
- `status` (repeatable: `read`, `unread`, `removed`)
- `starred` (boolean)
- `offset`, `limit` (ints)
- `order` (`id`, `status`, `published_at`, `category_title`, `category_id`)
- `direction` (`asc`, `desc`)
- Time filters (Unix timestamps): `before`, `after`, `published_before`, `published_after`, `changed_before`, `changed_after`
- `before_entry_id`, `after_entry_id` (int64)
- `category_id` (int)

Example: entries matching a term within a published date range
```bash
export QUERY="LLM"
# Use Unix epoch seconds for time filters
export PUBLISHED_AFTER=1704067200   # 2024-01-01T00:00:00Z
export PUBLISHED_BEFORE=1735689599  # 2024-12-31T23:59:59Z

curl -sS -H "X-Auth-Token: $TOKEN" \
  "$BASE_URL/v1/entries?search=$(printf %s "$QUERY" | jq -sRr @uri)&published_after=$PUBLISHED_AFTER&published_before=$PUBLISHED_BEFORE&limit=50&order=published_at&direction=desc"
```

Filter unread and/or starred entries:
```bash
curl -sS -H "X-Auth-Token: $TOKEN" \
  "$BASE_URL/v1/entries?status=unread&starred=false&limit=20"
```

Paginate with cursor-like params:
```bash
# Get older entries than a known entry id
curl -sS -H "X-Auth-Token: $TOKEN" \
  "$BASE_URL/v1/entries?before_entry_id=123456&limit=50"
```

### 5) Search Entries in a Specific Category
Ref: Get Category Entries

```bash
curl -sS -H "X-Auth-Token: $TOKEN" \
  "$BASE_URL/v1/categories/$CATEGORY_ID/entries?search=$(printf %s "$QUERY" | jq -sRr @uri)&published_after=$PUBLISHED_AFTER&published_before=$PUBLISHED_BEFORE&limit=50"
```

### 6) Search Entries for a Specific Feed
Ref: Get Feed Entries

```bash
curl -sS -H "X-Auth-Token: $TOKEN" \
  "$BASE_URL/v1/feeds/$FEED_ID/entries?search=$(printf %s "$QUERY" | jq -sRr @uri)&published_after=$PUBLISHED_AFTER&published_before=$PUBLISHED_BEFORE&limit=50"
```

### Error Handling
- 200/201/204 indicate success depending on endpoint (see reference). All endpoints used here return 200 on success.
- 401/403 indicate authentication/authorization issues.
- 500 indicates a server error.

### Non-Goals
- No mutations: endpoints like create/update/delete feeds, entries, categories are intentionally excluded.

#### Resolver Matching Algorithm
For both `resolveCategoryId` and `resolveFeedId`, names are matched using the following order:
1) Exact match (case-sensitive)
2) Case-insensitive equality
3) Collapsed non-alphanumeric equality (remove spaces/punctuation; e.g., "AI Code King" ≈ "AICodeKing")
4) Token subset match (all query tokens must appear in target tokens)
5) Partial includes (lowercased and collapsed comparisons)

Note: Matching removes diacritics before comparison (e.g., "Café" ≈ "Cafe").

#### Disambiguation and Chaining
A common task is to find content when the user provides a name that could be a category or a feed (e.g., "Show me articles from 'Tech News'"). The recommended workflow is:
1.  Call `resolveCategoryId` with the user's query (`'Tech News'`).
2.  **If it returns an ID**: The query refers to a category. You can now use this ID in `searchFeedsByCategory` or `searchEntries`.
3.  **If it returns `CATEGORY_NOT_FOUND`**: The query likely refers to a feed. Call `resolveFeedId` to get the feed's ID.
4.  Once you have the `feed_id`, you can use it in `getFeedDetails` or `searchEntries`.
5.  **If both resolvers fail**: Inform the user that the name could not be found. Use `listCategories` and `listFeeds` to help the user find what they are looking for.

This multi-step resolution process ensures that user intent is correctly interpreted before fetching data.