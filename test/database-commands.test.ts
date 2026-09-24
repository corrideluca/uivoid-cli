import assert from "node:assert/strict";
import test from "node:test";
import { Command } from "commander";
import { registerDatabaseCommands, parseArguments } from "../src/database-commands.js";

const config = { apiUrl: "https://api.test", portalUrl: "https://portal.test", token: "account-token" };

function program(): Command {
  const cli = new Command().exitOverride();
  registerDatabaseCommands(cli, async () => config);
  return cli;
}

test("hosted expose resolves project/database/table and sends server-derived operation definition", async (t) => {
  const requests: Array<{ path: string; body: unknown }> = [];
  t.mock.method(console, "log", () => {});
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit = {}) => {
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer account-token");
    const path = url.pathname;
    requests.push({ path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    let body: unknown = {};
    if (path === "/api/projects") body = { projects: [{ id: "p1", subdomain: "demo" }] };
    if (path.endsWith("/databases")) body = { databases: [{ id: "d1", name: "inventory" }] };
    if (path.endsWith("/tables")) body = { tables: [{ id: "t1", name: "products" }] };
    return new Response(JSON.stringify(body));
  });
  await program().parseAsync(["db", "expose", "products", "--project", "demo", "--db", "inventory",
    "--operation", "delete", "--name", "delete_product", "--description", "Delete one product", "--path", "/products"], { from: "user" });
  assert.deepEqual(requests.at(-1), { path: "/api/projects/p1/tools", body: {
    kind: "database", name: "delete_product", description: "Delete one product", hosted_table_id: "t1", operation: "delete", route: "/products",
  } });
});

test("hosted call uses account-authenticated run API without obtaining a DB connection string", async (t) => {
  const calls: string[] = [];
  t.mock.method(console, "log", () => {});
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit = {}) => {
    calls.push(url.pathname);
    if (url.pathname === "/api/projects") return new Response(JSON.stringify({ projects: [{ id: "p1", subdomain: "demo" }] }));
    if (url.pathname.endsWith("/tools")) return new Response(JSON.stringify({ tools: [{ id: "e1", name: "add_product", kind: "database" }] }));
    assert.deepEqual(JSON.parse(String(init.body)), { data: { name: "book" } });
    return new Response(JSON.stringify({ row: { id: "row-id" } }));
  });
  await program().parseAsync(["db", "call", "add_product", "--project", "demo", "--args", '{"data":{"name":"book"}}'], { from: "user" });
  assert.equal(calls.at(-1), "/api/projects/p1/tools/e1/run");
});

test("hosted call refuses ambiguous arguments and non-object JSON before network access", async () => {
  assert.throws(() => parseArguments("[]"), /JSON object/);
  assert.throws(() => parseArguments("null"), /JSON object/);
  await assert.rejects(program().parseAsync(["db", "call", "add", "--project", "demo", "--file", "x.json", "--args", "{}"], { from: "user" }), /not both/);
});
