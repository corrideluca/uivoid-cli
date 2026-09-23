import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { ApiError, UivoidApi } from "../src/api.js";

type Call = { url: string; method: string; body: unknown; auth: string | null };

function stubFetch(t: TestContext, status = 200, body: unknown = {}): Call[] {
  const calls: Call[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL | string, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init.headers).get("Authorization"),
    });
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  });
  return calls;
}

const api = new UivoidApi({ apiUrl: "https://api.test/", portalUrl: "https://portal.test", token: "tok" });

test("createProject sends organization_id only when given", async (t) => {
  const calls = stubFetch(t, 201, { id: "p1" });
  await api.createProject("demo");
  await api.createProject("demo", "org-1");
  assert.deepEqual(calls.map((c) => c.body), [{ subdomain: "demo" }, { subdomain: "demo", organization_id: "org-1" }]);
  assert.equal(calls[0]?.auth, "Bearer tok");
});

test("team methods hit the org-scoped endpoints", async (t) => {
  const calls = stubFetch(t, 200, {});
  await api.listMembers("org-1");
  await api.changeMemberRole("org-1", "7", "admin");
  await api.listInvitations("org-1");
  await api.createInvitation("org-1", "new@acme.io", "member");
  assert.deepEqual(calls.map((c) => [c.method, c.url, c.body]), [
    ["GET", "https://api.test/api/orgs/org-1/members", undefined],
    ["PATCH", "https://api.test/api/orgs/org-1/members/7", { role: "admin" }],
    ["GET", "https://api.test/api/orgs/org-1/invitations", undefined],
    ["POST", "https://api.test/api/orgs/org-1/invitations", { email: "new@acme.io", role: "member" }],
  ]);
});

test("deletes tolerate an empty 204 body", async (t) => {
  const calls = stubFetch(t, 204);
  await api.removeMember("org-1", "7");
  await api.revokeInvitation("org-1", "inv-1");
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [
    ["DELETE", "https://api.test/api/orgs/org-1/members/7"],
    ["DELETE", "https://api.test/api/orgs/org-1/invitations/inv-1"],
  ]);
});

test("acceptInvitation posts to the token path", async (t) => {
  const calls = stubFetch(t, 200, { organization: { id: "org-1", name: "Acme", slug: "acme", role: "member" } });
  const result = await api.acceptInvitation("Tok_en-123");
  assert.equal(calls[0]?.url, "https://api.test/api/invitations/Tok_en-123/accept");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(result.organization.role, "member");
});

test("server errors surface the backend message and status", async (t) => {
  stubFetch(t, 403, { error: "your role can't manage invites" });
  await assert.rejects(api.createInvitation("org-1", "x@acme.io", "member"), (error: unknown) =>
    error instanceof ApiError && error.status === 403 && error.message === "your role can't manage invites");
});
