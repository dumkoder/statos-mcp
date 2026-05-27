// scripts/smoke.mjs — protocol-level end-to-end smoke for @statospro/mcp.
//
// Spawns the built CLI (dist/cli.js) as a child process speaking stdio,
// exchanges real JSON-RPC messages, and prints what comes back. Mimics what
// Claude Code / Claude Desktop do when they connect to an MCP server.
//
// Usage:
//   node scripts/smoke.mjs                      # bogus key, exercises error paths
//   STATOS_API_KEY=statos_sk_… node scripts/smoke.mjs   # real key, exercises happy paths
//   STATOS_API_BASE=https://api.sandbox.statos.pro STATOS_API_KEY=… node scripts/smoke.mjs
//
// Exits non-zero if any required protocol step fails (initialize, tools/list).
// Does NOT exit non-zero on individual tool failures with bogus key — those
// are EXPECTED to come back as MCP-level isError responses, which is the
// behaviour we want to verify.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const cliPath = new URL("../dist/cli.js", import.meta.url).pathname;
const apiKey = process.env.STATOS_API_KEY ?? "statos_sk_test_00000000000000000000000000000000";
const apiBase = process.env.STATOS_API_BASE ?? "https://api.sandbox.statos.pro";
const usingBogusKey = !process.env.STATOS_API_KEY;

const child = spawn("node", [cliPath, "--api-key", apiKey, "--api-base", apiBase], {
  stdio: ["pipe", "pipe", "pipe"],
});

// stderr is the server's diagnostic channel; surface it verbatim under a label
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => process.stderr.write(`[server stderr] ${chunk}`));

const rl = createInterface({ input: child.stdout });
const pending = new Map();
let nextId = 1;

rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    const handler = pending.get(msg.id);
    if (handler) {
      pending.delete(msg.id);
      handler(msg);
    } else {
      console.log("[server unsolicited]", JSON.stringify(msg).slice(0, 200));
    }
  } catch {
    // Ignore non-JSON lines (shouldn't happen on the stdout channel but
    // be defensive against early-startup noise).
  }
});

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, resolve);
    const req = { jsonrpc: "2.0", id, method, ...(params !== undefined ? { params } : {}) };
    child.stdin.write(JSON.stringify(req) + "\n");
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout waiting for response to ${method}`));
      }
    }, 15000);
  });
}

function sectionHeader(s) {
  console.log("\n" + "─".repeat(60));
  console.log(s);
  console.log("─".repeat(60));
}

function preview(obj, max = 600) {
  const s = JSON.stringify(obj, null, 2);
  return s.length > max ? s.slice(0, max) + `\n... [truncated, total ${s.length} chars]` : s;
}

/**
 * Format a tools/call result's content[0].text.  On success the server
 * stringifies its result as JSON; on error it returns a human-readable
 * string.  Show either appropriately, capped at 400 chars.
 */
function showContent(result, max = 400) {
  const text = result?.content?.[0]?.text ?? "";
  if (result?.isError) {
    return text.length > max ? text.slice(0, max) + "…" : text;
  }
  try {
    return preview(JSON.parse(text), max);
  } catch {
    return text.slice(0, max);
  }
}

async function main() {
  sectionHeader(`@statospro/mcp smoke — using ${usingBogusKey ? "BOGUS" : "real"} key against ${apiBase}`);

  // 1. initialize handshake
  sectionHeader("1. initialize");
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "1.0.0" },
  });
  console.log(preview(init.result));
  if (!init.result || init.result.serverInfo?.name !== "@statospro/mcp") {
    console.error("FAIL: initialize did not return expected serverInfo.name=@statospro/mcp");
    process.exit(1);
  }
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  // 2. tools/list — verify both tools are advertised with schemas
  sectionHeader("2. tools/list");
  const list = await send("tools/list");
  const tools = list.result?.tools ?? [];
  console.log(`Discovered ${tools.length} tools:`);
  for (const t of tools) {
    const props = Object.keys(t.inputSchema?.properties ?? {}).join(", ");
    console.log(`  • ${t.name} — input: { ${props} }`);
    console.log(`    description: ${t.description.slice(0, 100)}...`);
  }
  // v0.2 surface: list_picks, get_match_picks, list_leagues, get_account.
  const expectedTools = ["get_account", "get_match_picks", "list_leagues", "list_picks"];
  if (tools.length !== expectedTools.length) {
    console.error(`FAIL: expected ${expectedTools.length} tools, got ${tools.length}`);
    process.exit(1);
  }
  const names = tools.map((t) => t.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedTools)) {
    console.error(`FAIL: expected ${JSON.stringify(expectedTools)}, got ${JSON.stringify(names)}`);
    process.exit(1);
  }

  // 3. call list_picks — minimal args
  sectionHeader("3. tools/call list_picks (default args)");
  const r1 = await send("tools/call", { name: "list_picks", arguments: {} });
  console.log("isError:", r1.result?.isError ?? false);
  console.log("content[0].text:", showContent(r1.result));

  // 4. call list_picks — exercise filters
  sectionHeader("4. tools/call list_picks (markets: [1x2], quality: strong, limit: 3)");
  const r2 = await send("tools/call", {
    name: "list_picks",
    arguments: { markets: ["1x2"], quality: "strong", limit: 3 },
  });
  console.log("isError:", r2.result?.isError ?? false);
  console.log("content[0].text:", showContent(r2.result));

  // 5. call get_match_picks
  sectionHeader("5. tools/call get_match_picks (match_id: 999999)");
  const r3 = await send("tools/call", {
    name: "get_match_picks",
    arguments: { match_id: 999999 },
  });
  console.log("isError:", r3.result?.isError ?? false);
  console.log("content[0].text:", showContent(r3.result));

  // 6. invalid args — verify zod validation surfaces a clean MCP error
  sectionHeader("6. tools/call list_picks with invalid args (limit: -5)");
  const r4 = await send("tools/call", {
    name: "list_picks",
    arguments: { limit: -5 },
  });
  console.log("isError:", r4.result?.isError ?? false);
  console.log("content[0].text:", r4.result.content[0].text.slice(0, 300));

  // 7. unknown tool — verify graceful error
  sectionHeader("7. tools/call unknown_tool — should surface as isError");
  const r5 = await send("tools/call", { name: "unknown_tool", arguments: {} });
  console.log("isError:", r5.result?.isError ?? false);
  console.log("content[0].text:", r5.result.content[0].text);

  sectionHeader("smoke complete");
  console.log("All protocol steps exchanged successfully.");
  console.log(
    usingBogusKey
      ? "(Used a bogus API key — calls hit the auth error path. Re-run with STATOS_API_KEY set\n for a real-data smoke.)"
      : "(Used a real API key — payloads above show actual live data.)",
  );

  child.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  child.kill();
  process.exit(1);
});
