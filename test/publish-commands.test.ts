import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Command } from "commander";
import { checkListingText, describeListing, registerPublishCommands } from "../src/publish-commands.js";
import type { RegistryListing } from "../src/types.js";

const config = { apiUrl: "https://api.test", portalUrl: "https://portal.test", token: "account-token" };
const pending: RegistryListing = {
  status: "pending", title: "Weather", description: "Forecasts", website_url: "", server_name: "app.uivoid/weather",
  remote_url: "https://weather.uivoid.app/mcp", version: null, published_at: null, rejection_reason: "", registry_url: null, last_error: "",
};

function program(): Command {
  const cli = new Command().exitOverride();
  registerPublishCommands(cli, async () => config);
  return cli;
}

function mockApi(t: TestContext, listing: unknown = pending) {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit = {}) => {
    requests.push({ method: init.method ?? "GET", path: url.pathname, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (url.pathname === "/api/projects") return new Response(JSON.stringify({ projects: [{ id: "p1", subdomain: "weather" }] }));
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ listing, eligible: true, ineligible_reason: "" }));
  });
  return requests;
}

test("publish sends the listing and prints the review status", async (t) => {
  const logs: string[] = [];
  t.mock.method(console, "log", (line: string) => logs.push(line));
  const requests = mockApi(t);
  await program().parseAsync(["publish", "weather", "--title", " Weather ", "--description", "Forecasts", "--website", "https://w.test"], { from: "user" });
  assert.deepEqual(requests.at(-1), { method: "PUT", path: "/api/projects/p1/listing",
    body: { title: "Weather", description: "Forecasts", website_url: "https://w.test" } });
  assert.match(logs.join("\n"), /In review/);
});

test("publish --status reads without changing anything", async (t) => {
  t.mock.method(console, "log", () => {});
  const requests = mockApi(t);
  await program().parseAsync(["publish", "weather", "--status"], { from: "user" });
  assert.deepEqual(requests.map((r) => r.method), ["GET", "GET"]);
});

test("listing text is validated before any network call", async (t) => {
  const requests = mockApi(t);
  assert.throws(() => checkListingText("title", "   "), /can't be empty/);
  assert.throws(() => checkListingText("description", "x".repeat(101)), /at most 100 characters \(it has 101\)/);
  await assert.rejects(program().parseAsync(["publish", "weather", "--title", "W", "--description", "x".repeat(101)], { from: "user" }), /at most 100/);
  assert.equal(requests.length, 0);
});

test("unpublish needs --yes without a terminal", async (t) => {
  t.mock.method(console, "log", () => {});
  const requests = mockApi(t);
  await assert.rejects(program().parseAsync(["unpublish", "weather"], { from: "user" }), /--yes/);
  await program().parseAsync(["unpublish", "weather", "--yes"], { from: "user" });
  assert.deepEqual(requests.at(-1), { method: "DELETE", path: "/api/projects/p1/listing", body: undefined });
});

test("describeListing explains ineligible and rejected states", () => {
  assert.match(describeListing("weather", { listing: null, eligible: false, ineligible_reason: "Activate it" }).join("\n"), /can't be listed yet: Activate it/);
  const rejected = { ...pending, status: "rejected" as const, rejection_reason: "Add tool descriptions" };
  assert.match(describeListing("weather", { listing: rejected, eligible: true, ineligible_reason: "" }).join("\n"), /Reason: Add tool descriptions/);
});
