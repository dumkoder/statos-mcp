// suppression-smoke.mjs — end-to-end Layer-4 retest for the WC market
// kill-switch MCP tools (suppress_market / list_suppressions / unsuppress_market).
//
// Spawns the built stdio server (dist/cli.js) as a real MCP client and drives
// the full lifecycle against a live backend. Requires an admin-scoped key
// (admin:market_suppressions + admin-role owner).
//
//   STATOS_API_KEY=$(cat /tmp/l4key) STATOS_API_BASE=https://sandbox.statos.pro \
//     node scripts/suppression-smoke.mjs
//
// Exits non-zero on the first failed assertion.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "../dist/cli.js");
const apiKey = process.env.STATOS_API_KEY;
const apiBase = process.env.STATOS_API_BASE || "https://api.statos.pro";
const LEAGUE = Number(process.env.WC_LEAGUE_ID || 84); // FIFA World Cup
if (!apiKey) { console.error("STATOS_API_KEY required"); process.exit(2); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}`); } };
const textOf = (r) => (r?.content || []).map((c) => c.text).join("\n");
const jsonOf = (r) => { try { return JSON.parse(textOf(r)); } catch { return null; } };

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [CLI, "--api-key", apiKey, "--api-base", apiBase],
});
const client = new Client({ name: "suppression-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  console.log(`Connected to MCP server (api-base=${apiBase}, league=${LEAGUE})\n`);

  // 1) tools/list — the 3 suppression tools must be advertised
  console.log("[1] tools/list");
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  console.log("    advertised:", names.join(", "));
  for (const t of ["suppress_market", "list_suppressions", "unsuppress_market"]) {
    ok(names.includes(t), `tool advertised: ${t}`);
  }

  // 2) baseline list
  console.log("[2] list_suppressions (baseline)");
  const base = jsonOf(await client.callTool({ name: "list_suppressions", arguments: {} }));
  ok(base && Array.isArray(base.suppressions), "list returns suppressions[]");
  const baseIds = new Set((base?.suppressions || []).map((s) => s.id));
  console.log(`    baseline count=${base?.count}`);

  // 3) suppress_market
  console.log("[3] suppress_market corners / league 84 / 1h");
  const created = jsonOf(await client.callTool({
    name: "suppress_market",
    arguments: { market_type: "corners", league_id: LEAGUE, hours: 1, reason: "layer4 retest" },
  }));
  const newId = created?.id ?? created?.suppression?.id;
  ok(Number.isInteger(newId), `created suppression id=${newId}`);
  ok(created?.market_type === "corners" || created?.suppression?.market_type === "corners", "market_type echoed = corners");

  // 4) list shows it
  console.log("[4] list_suppressions (after create)");
  const after = jsonOf(await client.callTool({ name: "list_suppressions", arguments: {} }));
  const found = (after?.suppressions || []).find((s) => s.id === newId);
  ok(!!found, "new suppression appears in list");
  ok(found && found.league_id === LEAGUE && found.market_type === "corners", "row fields correct (league_id+market_type)");

  // 5) unsuppress
  console.log("[5] unsuppress_market");
  const del = jsonOf(await client.callTool({ name: "unsuppress_market", arguments: { id: newId } }));
  ok(del && (del.deleted === newId || del.deleted), `delete acknowledged (${textOf({ content: [{ text: JSON.stringify(del) }] })})`);

  // 6) list no longer shows it
  console.log("[6] list_suppressions (after delete)");
  const final = jsonOf(await client.callTool({ name: "list_suppressions", arguments: {} }));
  const stillThere = (final?.suppressions || []).some((s) => s.id === newId);
  ok(!stillThere, "suppression removed from list");

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
} catch (e) {
  console.error("DRIVER ERROR:", e?.message || e);
  fail++;
} finally {
  await client.close().catch(() => {});
}
process.exit(fail ? 1 : 0);
