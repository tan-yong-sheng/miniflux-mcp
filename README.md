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
    "MINIFLUX_BASE_URL": "https://your-miniflux-url",
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
    "MINIFLUX_BASE_URL": "https://your-miniflux-url",
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
        "MINIFLUX_BASE_URL": "https://your-miniflux-url",
        "MINIFLUX_TOKEN": "<YOUR_MINIFLUX_API_TOKEN>"
      }
    }
    ```

## Available Tools

The server provides the following read-only tools for interacting with Miniflux:

- **`listCategories(counts?: boolean)`** - Lists all available categories.
  - `counts`: (Optional) If true, includes unread and feed counts.

- **`resolveCategoryId(category_name: string)`** - Finds the numeric ID for a category given its name.
  - `category_name`: The name of the category to resolve.

- **`searchFeedsByCategory(category_id: number, query?: string)`** - Searches for feeds within a specific category.
  - `category_id`: The numeric ID of the category. Use `resolveCategoryId` first if you have a name.
  - `query`: (Optional) A search term to filter feeds by title or URL.

- **`getFeedDetails(feed_id: number)`** - Gets the details of a single feed.
  - `feed_id`: The numeric ID of the feed. Use `searchFeedsByCategory` to find this ID if you only have a name.

- **`searchEntries(...)`** - A powerful tool to search for articles globally, by category, or by feed.
  - **Scope (provide one):**
    - `category_id`: Numeric ID of a category.
    - `feed_id`: Numeric ID of a feed.
  - **Filters (optional):**
    - `search`: Text query for titles and content.
    - `status`: Array of `read`, `unread`, or `removed`.
    - `starred`: `true` or `false`.
    - `limit`, `offset`: For pagination.
    - `order`, `direction`: For sorting.
    - `published_before`, `published_after`, `changed_before`, `changed_after`: Unix timestamps for date ranges.
    - `before_entry_id`, `after_entry_id`: For cursor-based pagination.


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


