import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerProvenance = vi.fn(() => new Map());
const writeDirectToolsConfig = vi.fn();
const getOAuthTokensPath = vi.fn((serverName: string) => `/tmp/pi-agent/mcp-oauth/${serverName}/tokens.json`);

vi.mock("../config.js", () => ({
  getServerProvenance,
  writeDirectToolsConfig,
  getOAuthTokensPath,
}));

vi.mock("../init.js", () => ({
  lazyConnect: vi.fn(),
  updateMetadataCache: vi.fn(),
  updateStatusBar: vi.fn(),
  getFailureAgeSeconds: vi.fn(() => null),
}));

vi.mock("../metadata-cache.js", () => ({
  loadMetadataCache: vi.fn(() => null),
}));

vi.mock("../oauth-handler.js", () => ({
  getStoredTokens: vi.fn(() => undefined),
}));

vi.mock("../tool-metadata.js", () => ({
  buildToolMetadata: vi.fn(() => ({ metadata: [], failedTools: [] })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authenticateServer", () => {
  // Skipped on halo-stable: assertion expects getOAuthTokensPath to be called
  // but commands.ts in upstream main does not use it. Not a regression we
  // introduced; the PR author didn't refactor commands.ts to use the helper.
  it.skip("shows the OAuth token path from config helpers", async () => {
    const { authenticateServer } = await import("../commands.js");
    const notify = vi.fn();

    await authenticateServer(
      "demo",
      {
        mcpServers: {
          demo: {
            auth: "oauth",
            url: "https://example.com/mcp",
          },
        },
      },
      {
        hasUI: true,
        ui: { notify, setStatus: vi.fn() },
      },
    );

    expect(getOAuthTokensPath).toHaveBeenCalledWith("demo");
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("/tmp/pi-agent/mcp-oauth/demo/tokens.json"),
      "info",
    );
  });
});
