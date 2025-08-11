# Miniflux MCP Server

A read-only Model Context Protocol (MCP) server for the [Miniflux](https://miniflux.app/) RSS reader. This server provides tools to interact with your Miniflux instance's feeds, categories, and entries through MCP.

It is based on the official Miniflux API, as described in the `openapi.yaml` specification.

## Quick Start

Make sure to set up your environment variables first. You can create a `.env` file in the project root or export them in your shell.

- `MINIFLUX_BASE_URL` (required): The full URL to your Miniflux instance (e.g., `https://miniflux.example.org`).
- `MINIFLUX_TOKEN` (required): Your API token, which can be generated under "Settings > API Keys" in Miniflux.

## Installation

### For use with clients like Claude Desktop

You can configure a client to connect to this MCP server. Add the following configuration to the `mcpServers` object in your client's configuration file.

#### Using `npx` (Recommended)

This method automatically downloads and runs the latest version of the package from npm.

**For Windows:**
```json
"miniflux-mcp": {
  "command": "cmd",
  "args": [
    "/k",
    "npx",
    "-y",
    "miniflux-mcp"
  ],
  "env": {
    "MINIFLUX_BASE_URL": "http://localhost:8080",
    "MINIFLUX_TOKEN": "<YOUR_MINIFLUX_API_TOKEN>"
  }
}
```

**For Linux/macOS:**
```json
"miniflux-mcp": {
  "command": "npx",
  "args": [
    "-y",
    "miniflux-mcp"
  ],
  "env": {
    "MINIFLUX_BASE_URL": "http://localhost:8080",
    "MINIFLUX_TOKEN": "<YOUR_MINIFLUX_API_TOKEN>"
  }
}
```

#### For Local Development

If you are developing the server locally, you can point the client directly to your built source code.

1. Clone the repository and build the project:
   ```bash
   git clone https://github.com/tan-yong-sheng/miniflux-mcp.git
   cd miniflux-mcp
   npm install
   npm run build
   ```

2.  Update the client configuration to run the local script:

    ```json
    "miniflux-mcp": {
      "command": "node",
      "args": [
        "/path/to/miniflux-mcp/dist/server.js"
      ],
      "env": {
        "MINIFLUX_BASE_URL": "http://localhost:8080",
        "MINIFLUX_TOKEN": "<YOUR_MINIFLUX_API_TOKEN>"
      }
    }
    ```

## Available Tools

The server provides the following read-only tools for interacting with Miniflux.

**Resolver/Search Workflow:**
For any query involving a name (e.g., "find 'Tech Stuff'"), you must follow this sequence:
1.  `resolveCategoryId`: Try to match the name to a category.
2.  `resolveFeedId`: If no category is found, try to match the name to a feed.
3.  `listCategories` / `listFeeds`: If both resolvers fail, inform the user and offer these tools to help them find the correct name.

**Available Tools:**

*   **`resolveCategoryId(category_name)`**: **(Step 1)** Resolves a category name to its ID.
*   **`resolveFeedId(feed_query)`**: **(Step 2)** Resolves a feed name/URL to its ID.
*   **`listCategories(counts)`**: **(Fallback)** Lists all categories for browsing.
*   **`listFeeds()`**: **(Fallback)** Lists all feeds for browsing.
*   **`searchFeedsByCategory(category_id, query)`**: Searches for feeds within a *specific category*.
*   **`getFeedDetails(feed_id)`**: Retrieves details for a *single feed*.
*   **`searchEntries(...)`**: Searches for articles. Can be scoped by `category_id` or `feed_id` once resolved.

## Development

If you want to contribute or modify the server:

```bash
# Clone the repository (replace with your fork)
git clone https://github.com/YOUR_USERNAME/miniflux-mcp.git
cd miniflux-mcp

# Install dependencies
npm install

# Build the server (compiles TS to JS in dist/)
npm run build

# Start the server locally
npm start
```


