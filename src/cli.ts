#!/usr/bin/env node
// statos-mcp — stdio entry point. Wired in package.json's `bin.statos-mcp`.
//
// Reads the Statos API key from either:
//   1. the --api-key CLI flag, or
//   2. the STATOS_API_KEY env var
//
// Exits non-zero with a helpful message if no key is supplied, since
// every tool needs it to do anything useful.

import { runStdio } from "./server.js";

function parseArgs(argv: string[]): {
  apiKey?: string;
  baseUrl?: string;
  help?: boolean;
  version?: boolean;
} {
  const out: { apiKey?: string; baseUrl?: string; help?: boolean; version?: boolean } =
    {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--api-key":
        out.apiKey = argv[++i];
        break;
      case "--api-base":
        out.baseUrl = argv[++i];
        break;
      case "-h":
      case "--help":
        out.help = true;
        break;
      case "-v":
      case "--version":
        out.version = true;
        break;
      default:
        if (a !== undefined && a.startsWith("--api-key=")) {
          out.apiKey = a.slice("--api-key=".length);
        } else if (a !== undefined && a.startsWith("--api-base=")) {
          out.baseUrl = a.slice("--api-base=".length);
        }
    }
  }
  return out;
}

function printHelp(): void {
  // Help goes to stderr because stdout is the MCP transport channel.
  process.stderr.write(
    [
      "statos-mcp — Model Context Protocol server for Statos",
      "",
      "Usage:",
      "  statos-mcp --api-key <key> [--api-base <url>]",
      "  STATOS_API_KEY=<key> statos-mcp",
      "",
      "Options:",
      "  --api-key <key>     Statos API key (statos_sk_live_… or statos_sk_test_…)",
      "                      Falls back to $STATOS_API_KEY.",
      "  --api-base <url>    Statos API base URL.",
      "                      Default: https://api.statos.pro  (env: $STATOS_API_BASE)",
      "  -v, --version       Print version and exit.",
      "  -h, --help          Print this help and exit.",
      "",
      "Configure in Claude Desktop ~/Library/Application Support/Claude/claude_desktop_config.json:",
      '  { "mcpServers": { "statos": {',
      '      "command": "npx",',
      '      "args": ["-y", "@statos/mcp@latest"],',
      '      "env": { "STATOS_API_KEY": "statos_sk_live_…" }',
      "  } } }",
      "",
      "Configure in Claude Code:",
      "  claude mcp add statos -- npx -y @statos/mcp@latest --api-key statos_sk_live_…",
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.version) {
    // Read from package.json at runtime would force a JSON import; keep it
    // simple — version is also baked into User-Agent via server.ts.
    process.stderr.write("@statos/mcp 0.1.0\n");
    process.exit(0);
  }

  const apiKey = args.apiKey ?? process.env.STATOS_API_KEY;
  if (!apiKey) {
    process.stderr.write(
      "statos-mcp: missing API key. Pass --api-key or set STATOS_API_KEY.\n" +
        "Get a key at https://statos.pro/account → API keys.\n" +
        "Run `statos-mcp --help` for setup snippets.\n",
    );
    process.exit(2);
  }

  const baseUrl = args.baseUrl ?? process.env.STATOS_API_BASE ?? "https://api.statos.pro";

  await runStdio({ apiKey, baseUrl });
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`statos-mcp: fatal: ${msg}\n`);
  process.exit(1);
});
