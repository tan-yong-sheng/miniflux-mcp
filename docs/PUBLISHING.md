# Publishing the Miniflux MCP to NPM

This guide provides the steps to publish your Miniflux MCP server to the npm registry. This will make it publicly available and installable via `npx`.

### Prerequisites

1.  **Node.js and npm**: Ensure you have Node.js and npm installed. You can check with `node -v` and `npm -v`.
2.  **npm Account**: You need an account on [npmjs.com](https://www.npmjs.com/).

### Step 1: Prepare `package.json`

Before your first publish, you need to make sure your `package.json` is correctly configured.

1.  **Choose a Unique Package Name**: The `name` field in `package.json` must be unique on the npm registry. The current name is `miniflux-mcp`. If this is taken, you will need to choose another one (e.g., by prefixing it with your username: `@username/miniflux-mcp`).
2.  **Update Author and Repository**: Change the `author` and `repository.url` fields to reflect your name and GitHub repository URL.

### Step 2: Build Your Project

The TypeScript code in `src/` needs to be compiled into JavaScript in `dist/`. The `files` array in `package.json` is configured to only include the `dist/` directory, ensuring that users download the compiled code.

Run the build command:
```bash
npm run build
```

This will create the `dist/server.js` file, which is the entry point for your MCP.

### Step 3: Log in to npm

You need to authenticate with the npm registry from your terminal.

```bash
npm login
```

Follow the prompts to enter your npm username, password, and one-time password (if you have two-factor authentication enabled).

### Step 4: Publish the Package

Once you are logged in, you can publish your package.

```bash
npm publish
```

If you are publishing a scoped package (e.g., `@username/packagename`), you need to add an access flag:
```bash
npm publish --access public
```

### Step 5: Verify the Publication

You can check the npm registry to see your published package:
`https://www.npmjs.com/package/miniflux-mcp` (replace `miniflux-mcp` with your package name).

You can also test it locally using `npx`:
```bash
npx miniflux-mcp
```
This command will download and run your published package.

### Updating Your Package

When you make changes to your MCP:
1.  **Increment the Version**: Update the `version` field in `package.json` (e.g., from `1.0.0` to `1.0.1`). It's good practice to follow [Semantic Versioning (SemVer)](https://semver.org/).
2.  **Re-build**: `npm run build`
3.  **Re-publish**: `npm publish`

You cannot publish the same version number twice. You must increment the version for every new publish.
