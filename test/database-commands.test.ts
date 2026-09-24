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

for (const scenario of [
  { args: ["add-column", "products", "priority", "--type", "text"], method: "POST", suffix: "", body: { name: "priority", definition: { type: "text", required: false } } },
  { args: ["add-column", "t1", "count", "--type", "integer", "--required"], method: "POST", suffix: "", body: { name: "count", definition: { type: "integer", required: true } } },
  { args: ["set-required", "products", "priority", "--required", "true"], method: "PATCH", suffix: "/priority", body: { required: true } },
  { args: ["set-required", "t1", "priority", "--required", "false"], method: "PATCH", suffix: "/priority", body: { required: false } },
  { args: ["rename-column", "products", "priority", "importance", "--confirm", "priority"], method: "PATCH", suffix: "/priority", body: { name: "importance", confirm: "priority" } },
  { args: ["drop-column", "t1", "priority", "--confirm", "priority"], method: "DELETE", suffix: "/priority", body: { confirm: "priority" } },
]) {
  test(`schema command resolves table and sends ${scenario.args.join(" ")}`, async (t) => {
    const requests: Array<{ path: string; method: string; body: unknown }> = [];
    const logs = t.mock.method(console, "log", () => {});
    t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit = {}) => {
      requests.push({ path: url.pathname, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url.pathname === "/api/projects") return new Response(JSON.stringify({ projects: [{ id: "p1", subdomain: "demo" }] }));
      if (url.pathname.endsWith("/databases")) return new Response(JSON.stringify({ databases: [{ id: "d1", name: "inventory" }] }));
      if (url.pathname.endsWith("/tables")) return new Response(JSON.stringify({ tables: [{ id: "t1", name: "products" }] }));
      return new Response(JSON.stringify({ id: "t1", columns: { priority: { type: "text" } } }));
    });
    await program().parseAsync(["db", "table", ...scenario.args, "--db", "inventory", "--project", "demo"], { from: "user" });
    assert.deepEqual(requests.at(-1), { path: `/api/projects/p1/databases/d1/tables/t1/columns${scenario.suffix}`, method: scenario.method, body: scenario.body });
    assert.deepEqual(JSON.parse(String(logs.mock.calls[0]?.arguments[0])), { id: "t1", columns: { priority: { type: "text" } } });
  });
}

for (const args of [["rename-column", "products", "old", "new"], ["drop-column", "products", "old"]]) {
  test(`${args[0]} requires explicit --confirm without prompting`, async (t) => {
    const cli = program().configureOutput({ writeErr: () => {} });
    const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not fetch"); });
    await assert.rejects(cli.parseAsync(["db", "table", ...args, "--db", "inventory", "--project", "demo"], { from: "user" }), /--confirm/);
    assert.equal(fetch.mock.callCount(), 0);
  });
}

test("set-required never treats the string false or an arbitrary value as truthy", async () => {
  await assert.rejects(program().parseAsync(["db", "table", "set-required", "products", "name", "--required", "yes", "--db", "inventory", "--project", "demo"], { from: "user" }), /true or false/);
});

test("wrong schema confirmation is sent to the backend and its error is preserved", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    if (url.pathname === "/api/projects") return new Response(JSON.stringify({ projects: [{ id: "p1", subdomain: "demo" }] }));
    if (url.pathname.endsWith("/databases")) return new Response(JSON.stringify({ databases: [{ id: "d1", name: "inventory" }] }));
    if (url.pathname.endsWith("/tables")) return new Response(JSON.stringify({ tables: [{ id: "t1", name: "products" }] }));
    return new Response(JSON.stringify({ error: "Set confirm to 'name': data in this column is permanently deleted" }), { status: 400 });
  });
  await assert.rejects(program().parseAsync(["db", "table", "drop-column", "products", "name", "--confirm", "wrong", "--db", "inventory", "--project", "demo"], { from: "user" }), /permanently deleted/);
});
