# Team Invites & Orgs — CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `org`, `team` and `invite accept` commands, `create --org`, and multi-org-aware `login`/`whoami` to the uivoid CLI, using the backend team API from uivoid-be PR #16.

**Architecture:** Pure helpers for choosing an org, parsing invite links, parsing roles and looking up members live in `src/orgs.ts`, with unit tests. `src/api.ts` gets typed methods for the new endpoints, tested against a stubbed `fetch`. The new commands live in `src/team-commands.ts` as `registerTeamCommands(program, authenticatedConfig)`, which keeps `src/cli.ts` from growing further. `cli.ts` only wires them up and changes `login`, `whoami` and `create`.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, NodeNext ESM with `.js` import suffixes), commander, @inquirer/prompts, picocolors, `node:test` via `npm test` (tsx).

**Spec:** `/Users/corri/uivoid-be/docs/superpowers/specs/2026-09-23-team-invites-and-roles-design.md`, Section 5 (CLI). Sections 2–3 cover roles and the API.

## Global Constraints

- Roles are exactly `owner`, `admin`, `member`. Only `owner` and `admin` can manage the team, meaning list invites and send invites.
- Backend endpoints:
  - `GET /api/orgs/<id>/members` → `{members: [{user_id, email, role, joined_at}]}`
  - `PATCH /api/orgs/<id>/members/<user_id>` with `{role}`
  - `DELETE /api/orgs/<id>/members/<user_id>` → 204
  - `GET /api/orgs/<id>/invitations` → `{invitations: [{id, email, role, invited_by, created_at, expires_at}]}`
  - `POST /api/orgs/<id>/invitations` with `{email, role}` → 201 plus `invite_url`
  - `DELETE /api/orgs/<id>/invitations/<id>` → 204
  - `POST /api/invitations/<token>/accept` → `{organization: {id, name, slug, role}}`
  - `POST /api/projects` accepts `organization_id`
  - `GET /api/auth/me` → `{id, email, organizations: [{id, name, slug, role}]}`
- Invite links look like `{portal}/invite/<token>`. Tokens are base64url (`[A-Za-z0-9_-]`, 43 chars).
- The stored default org is `config.organization` (`{id, name, slug}`; never store the `role`). Write it with `readConfig()` → modify → `writeConfig()`. **Never** write the config returned by `authenticatedConfig()`: it may contain a `--token`/`UIVOID_TOKEN` override that must not be saved to disk.
- Every new command accepts `--token <token>` like the existing ones. Commands that act on an org accept `--org <org>` (slug or id).
- Follow the existing command style: `pc.green("✓")` success lines, `pc.dim` hints, and `--json` printing exactly one `JSON.stringify` line.
- Baseline: `npm test` shows 27 passing and `npm run typecheck` is clean. Work on branch `feature/team-invites` in `/Users/corri/uivoid-cli`.

## File Structure

- `src/types.ts`: add `Role`, `Organization`, `Membership`, `Member`, `Invitation`, `CreatedInvitation`, and `Project.organization_id`.
- `src/orgs.ts` **(new)**: `ROLES`, `MANAGE_ROLES`, `parseRole`, `defaultOrg`, `resolveOrg`, `toStoredOrg`, `parseInviteToken`, `findMember`, `findInvitation`.
- `src/api.ts`: `me()` typing, `createProject(subdomain, organizationId?)`, and the team and invitation methods.
- `src/team-commands.ts` **(new)**: the `org list|use`, `team list|invite|revoke|role|remove|leave` and `invite accept` commands.
- `src/cli.ts`: wire up the team commands; update `login`, `whoami` and `create --org`.
- `test/orgs.test.ts`, `test/api.test.ts` **(new)**.
- `README.md`, `skill/uivoid/SKILL.md`: docs.

---

### Task 1: Types and org helpers

**Files:**
- Modify: `src/types.ts`
- Create: `src/orgs.ts`
- Create: `test/orgs.test.ts`

**Interfaces:**
- Produces, from `src/types.ts`:
  - `type Role = "owner" | "admin" | "member"`
  - `type Organization = { id: string; name: string; slug: string }` (the same shape as `Config["organization"]`)
  - `interface Membership extends Organization { role: Role }`
  - `interface Member { user_id: string; email: string; role: Role; joined_at: string }`
  - `interface Invitation { id: string; email: string; role: Role; invited_by: string | null; created_at: string; expires_at: string }`
  - `interface CreatedInvitation extends Invitation { invite_url: string }`
- Produces, from `src/orgs.ts`:
  - `ROLES`, `MANAGE_ROLES`
  - `parseRole(value: string): Role`
  - `defaultOrg(orgs: Membership[], stored?: Organization): Membership | undefined`
  - `resolveOrg(orgs: Membership[], flag?: string, stored?: Organization): Membership`
  - `toStoredOrg(org: Organization): Organization`
  - `parseInviteToken(input: string): string`
  - `findMember(members: Member[], email: string): Member`
  - `findInvitation(invitations: Invitation[], emailOrId: string): Invitation`

- [ ] **Step 1: Write the failing tests.** Create `test/orgs.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultOrg, findInvitation, findMember, parseInviteToken, parseRole, resolveOrg, toStoredOrg,
} from "../src/orgs.js";
import type { Invitation, Member, Membership } from "../src/types.js";

const acme: Membership = { id: "org-acme", name: "Acme", slug: "acme", role: "owner" };
const side: Membership = { id: "org-side", name: "Side", slug: "side", role: "member" };
const token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

test("parseRole accepts known roles case-insensitively and rejects others", () => {
  assert.equal(parseRole("Admin"), "admin");
  assert.throws(() => parseRole("superuser"), /Unknown role "superuser"\. Use one of: owner, admin, member\./);
});

test("defaultOrg prefers the stored org while still a member, else the only org", () => {
  assert.equal(defaultOrg([acme, side], { id: "org-side", name: "Side", slug: "side" }), side);
  assert.equal(defaultOrg([acme], { id: "org-gone", name: "Gone", slug: "gone" }), acme);
  assert.equal(defaultOrg([acme, side], undefined), undefined);
  assert.equal(defaultOrg([], undefined), undefined);
});

test("resolveOrg matches --org by slug or id", () => {
  assert.equal(resolveOrg([acme, side], "side"), side);
  assert.equal(resolveOrg([acme, side], "org-acme"), acme);
  assert.throws(() => resolveOrg([acme, side], "nope"), /not a member of an organization called "nope"\. Yours: acme, side\./);
});

test("resolveOrg falls back to the default and explains ambiguity", () => {
  assert.equal(resolveOrg([acme], undefined), acme);
  assert.equal(resolveOrg([acme, side], undefined, { id: "org-acme", name: "Acme", slug: "acme" }), acme);
  assert.throws(() => resolveOrg([acme, side], undefined), /several organizations \(acme, side\)\. Pass --org <slug> or run `uivoid org use <slug>`\./);
  assert.throws(() => resolveOrg([], undefined), /doesn't belong to any organization/);
});

test("toStoredOrg drops the role", () => {
  assert.deepEqual(toStoredOrg(acme), { id: "org-acme", name: "Acme", slug: "acme" });
});

test("parseInviteToken accepts a raw token or an invite link", () => {
  assert.equal(parseInviteToken(token), token);
  assert.equal(parseInviteToken(` https://portal.uivoid.app/invite/${token} `), token);
  assert.equal(parseInviteToken(`http://localhost:3000/invite/${token}/?utm=x`), token);
  assert.throws(() => parseInviteToken("https://portal.uivoid.app/projects/abc"), /doesn't look like a UIvoid invite link or token/);
  assert.throws(() => parseInviteToken("short"), /doesn't look like a UIvoid invite link or token/);
  assert.throws(() => parseInviteToken("not a url://"), /doesn't look like a UIvoid invite link or token/);
});

test("findMember matches email case-insensitively", () => {
  const members: Member[] = [{ user_id: "7", email: "Ada@acme.io", role: "admin", joined_at: "2026-09-01T00:00:00Z" }];
  assert.equal(findMember(members, " ada@ACME.io ").user_id, "7");
  assert.throws(() => findMember(members, "bob@acme.io"), /bob@acme\.io isn't a member of this organization\./);
});

test("findInvitation matches by id or email", () => {
  const invitations: Invitation[] = [{
    id: "inv-1", email: "new@acme.io", role: "member", invited_by: "ada@acme.io",
    created_at: "2026-09-20T00:00:00Z", expires_at: "2026-09-27T00:00:00Z",
  }];
  assert.equal(findInvitation(invitations, "inv-1").email, "new@acme.io");
  assert.equal(findInvitation(invitations, "NEW@acme.io").id, "inv-1");
  assert.throws(() => findInvitation(invitations, "x@acme.io"), /No pending invite for x@acme\.io\./);
});
```

- [ ] **Step 2: Run the tests to confirm they fail.**

Run: `npm test`
Expected: FAIL. `test/orgs.test.ts` can't resolve `../src/orgs.js`.

- [ ] **Step 3: Add the types.** In `src/types.ts`, add `organization_id?: string;` to `Project` after `subdomain`, then append:

```ts
export type Role = "owner" | "admin" | "member";

export type Organization = NonNullable<Config["organization"]>;

export interface Membership extends Organization {
  role: Role;
}

export interface Member {
  user_id: string;
  email: string;
  role: Role;
  joined_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
}

export interface CreatedInvitation extends Invitation {
  invite_url: string;
}
```

- [ ] **Step 4: Implement the helpers.** Create `src/orgs.ts`:

```ts
import type { Invitation, Member, Membership, Organization, Role } from "./types.js";

export const ROLES: readonly Role[] = ["owner", "admin", "member"];
/** Roles that can see and send invites; matches the backend's MANAGE_ROLES. */
export const MANAGE_ROLES: readonly Role[] = ["owner", "admin"];

export function parseRole(value: string): Role {
  const role = value.trim().toLowerCase();
  if (!(ROLES as readonly string[]).includes(role)) {
    throw new Error(`Unknown role ${JSON.stringify(value)}. Use one of: ${ROLES.join(", ")}.`);
  }
  return role as Role;
}

/** The org commands use without --org: the stored default while still a member, else the only org. */
export function defaultOrg(orgs: Membership[], stored?: Organization): Membership | undefined {
  return orgs.find((org) => org.id === stored?.id) ?? (orgs.length === 1 ? orgs[0] : undefined);
}

export function resolveOrg(orgs: Membership[], flag?: string, stored?: Organization): Membership {
  if (!orgs.length) {
    throw new Error("Your account doesn't belong to any organization. Accept an invite with `uivoid invite accept <link>` or create one in the portal.");
  }
  const choices = orgs.map((org) => org.slug).join(", ");
  if (flag) {
    const match = orgs.find((org) => org.slug === flag || org.id === flag);
    if (!match) throw new Error(`You're not a member of an organization called ${JSON.stringify(flag)}. Yours: ${choices}.`);
    return match;
  }
  const fallback = defaultOrg(orgs, stored);
  if (!fallback) throw new Error(`You belong to several organizations (${choices}). Pass --org <slug> or run \`uivoid org use <slug>\`.`);
  return fallback;
}

export function toStoredOrg(org: Organization): Organization {
  return { id: org.id, name: org.name, slug: org.slug };
}

export function parseInviteToken(input: string): string {
  const value = input.trim();
  let token = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      const segments = new URL(value).pathname.split("/").filter(Boolean);
      const at = segments.indexOf("invite");
      token = at >= 0 ? segments[at + 1] ?? "" : "";
    } catch {
      token = "";
    }
  }
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) throw new Error("That doesn't look like a UIvoid invite link or token.");
  return token;
}

export function findMember(members: Member[], email: string): Member {
  const needle = email.trim().toLowerCase();
  const match = members.find((member) => member.email.toLowerCase() === needle);
  if (!match) throw new Error(`${email.trim()} isn't a member of this organization.`);
  return match;
}

export function findInvitation(invitations: Invitation[], emailOrId: string): Invitation {
  const needle = emailOrId.trim();
  const match = invitations.find((invite) => invite.id === needle || invite.email.toLowerCase() === needle.toLowerCase());
  if (!match) throw new Error(`No pending invite for ${needle}.`);
  return match;
}
```

- [ ] **Step 5: Run the tests and typecheck.**

Run: `npm test && npm run typecheck`
Expected: all tests pass (27 existing plus 8 new) and typecheck is clean.

- [ ] **Step 6: Commit.**

```bash
git add src/types.ts src/orgs.ts test/orgs.test.ts
git commit -m "Add org, role and invite-link helpers"
```

---

### Task 2: API client methods

**Files:**
- Modify: `src/api.ts`
- Create: `test/api.test.ts`

**Interfaces:**
- Consumes: the types from Task 1
- Produces these `UivoidApi` methods:
  - `me(): Promise<{ id: string; email: string; organizations: Membership[] }>`
  - `createProject(subdomain: string, organizationId?: string): Promise<Project>`
  - `listMembers(orgId: string): Promise<{ members: Member[] }>`
  - `changeMemberRole(orgId: string, userId: string, role: Role): Promise<Member>`
  - `removeMember(orgId: string, userId: string): Promise<void>`
  - `listInvitations(orgId: string): Promise<{ invitations: Invitation[] }>`
  - `createInvitation(orgId: string, email: string, role: Role): Promise<CreatedInvitation>`
  - `revokeInvitation(orgId: string, invitationId: string): Promise<void>`
  - `acceptInvitation(token: string): Promise<{ organization: Membership }>`

- [ ] **Step 1: Write the failing tests.** Create `test/api.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to confirm they fail.**

Run: `npm test`
Expected: FAIL. The TypeScript/tsx run reports that `listMembers` (and the other new methods) are not functions, or the `createProject` assertion fails.

- [ ] **Step 3: Implement.** In `src/api.ts`, change the import to:

```ts
import type {
  Config, CreatedInvitation, Invitation, Member, Membership, PassthroughConfig, PassthroughConfigInput, Project, Role, ToolDefinition,
} from "./types.js";
```

Replace `me()` and `createProject()` with:

```ts
  me(): Promise<{ id: string; email: string; organizations: Membership[] }> {
    return this.request("api/auth/me");
  }

  createProject(subdomain: string, organizationId?: string): Promise<Project> {
    return this.request("api/projects", {
      method: "POST",
      body: JSON.stringify({ subdomain, ...(organizationId ? { organization_id: organizationId } : {}) }),
    });
  }
```

After `setPassthroughConfig`, add:

```ts
  listMembers(orgId: string): Promise<{ members: Member[] }> {
    return this.request(`api/orgs/${orgId}/members`);
  }

  changeMemberRole(orgId: string, userId: string, role: Role): Promise<Member> {
    return this.request(`api/orgs/${orgId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
  }

  removeMember(orgId: string, userId: string): Promise<void> {
    return this.request(`api/orgs/${orgId}/members/${userId}`, { method: "DELETE" });
  }

  listInvitations(orgId: string): Promise<{ invitations: Invitation[] }> {
    return this.request(`api/orgs/${orgId}/invitations`);
  }

  createInvitation(orgId: string, email: string, role: Role): Promise<CreatedInvitation> {
    return this.request(`api/orgs/${orgId}/invitations`, { method: "POST", body: JSON.stringify({ email, role }) });
  }

  revokeInvitation(orgId: string, invitationId: string): Promise<void> {
    return this.request(`api/orgs/${orgId}/invitations/${invitationId}`, { method: "DELETE" });
  }

  acceptInvitation(token: string): Promise<{ organization: Membership }> {
    return this.request(`api/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" });
  }
```

- [ ] **Step 4: Run the tests and typecheck.**

Run: `npm test && npm run typecheck`
Expected: all tests pass and typecheck is clean. If typecheck flags `me.organizations[0]` being assigned to `Config["organization"]` in `src/cli.ts`, that assignment still type-checks because `Membership` is a structural superset. Leave `cli.ts` alone here; Task 3 rewrites that code.

- [ ] **Step 5: Commit.**

```bash
git add src/api.ts test/api.test.ts
git commit -m "Add team and invitation methods to the API client"
```

---

### Task 3: `org`, `team` and `invite` commands; multi-org `login`/`whoami`/`create`

**Files:**
- Create: `src/team-commands.ts`
- Modify: `src/cli.ts`:
  - imports
  - the `login` action
  - the `whoami` action
  - the `create` options and account/org resolution
  - wiring before `program.configureOutput`

**Interfaces:**
- Consumes:
  - from `src/orgs.ts` (Task 1): `MANAGE_ROLES`, `defaultOrg`, `resolveOrg`, `toStoredOrg`, `parseInviteToken`, `parseRole`, `findMember`, `findInvitation`
  - the `UivoidApi` methods from Task 2
  - `readConfig`/`writeConfig` from `src/config.ts`
- Produces: `registerTeamCommands(program: Command, authenticatedConfig: (token?: string) => Promise<Config>): void`

- [ ] **Step 1: Create the commands module.** Create `src/team-commands.ts`:

```ts
import { confirm } from "@inquirer/prompts";
import type { Command } from "commander";
import pc from "picocolors";
import { UivoidApi } from "./api.js";
import { readConfig, writeConfig } from "./config.js";
import {
  MANAGE_ROLES, defaultOrg, findInvitation, findMember, parseInviteToken, parseRole, resolveOrg, toStoredOrg,
} from "./orgs.js";
import type { Config, Organization } from "./types.js";

type AuthenticatedConfig = (token?: string) => Promise<Config>;
interface CommonOptions { org?: string; token?: string; json?: boolean; yes?: boolean }

const TOKEN_OPTION = ["--token <token>", "personal access token (or use UIVOID_TOKEN)"] as const;
const JSON_OPTION = ["--json", "print a machine-readable JSON object instead of formatted text"] as const;
const ORG_OPTION = ["--org <org>", "organization slug or id (defaults to the one set with `uivoid org use`)"] as const;

/** Persist the default org without saving any --token/UIVOID_TOKEN override to disk. */
async function storeDefaultOrg(organization: Organization | undefined): Promise<void> {
  const { organization: _previous, ...stored } = await readConfig();
  await writeConfig(organization ? { ...stored, organization: toStoredOrg(organization) } : stored);
}

function expiresIn(iso: string): string {
  const days = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 86_400_000));
  return days === 1 ? "1 day" : `${days} days`;
}

async function confirmOrRequireYes(options: CommonOptions, message: string): Promise<boolean> {
  if (options.yes) return true;
  if (!process.stdin.isTTY) throw new Error("No interactive terminal detected. Pass --yes to confirm.");
  return confirm({ message, default: false });
}

export function registerTeamCommands(program: Command, authenticatedConfig: AuthenticatedConfig): void {
  async function orgContext(options: CommonOptions) {
    const config = await authenticatedConfig(options.token);
    const api = new UivoidApi(config);
    const me = await api.me();
    return { api, me, org: resolveOrg(me.organizations, options.org, config.organization) };
  }

  const org = program.command("org").description("List your organizations and choose the default one");

  org.command("list")
    .description("List the organizations you belong to")
    .option(...TOKEN_OPTION)
    .option(...JSON_OPTION)
    .action(async (options: CommonOptions) => {
      const config = await authenticatedConfig(options.token);
      const me = await new UivoidApi(config).me();
      const current = defaultOrg(me.organizations, config.organization);
      if (options.json) {
        console.log(JSON.stringify({ organizations: me.organizations.map((o) => ({ ...o, default: o.id === current?.id })) }));
        return;
      }
      if (!me.organizations.length) return console.log(pc.dim("You don't belong to any organization yet."));
      for (const o of me.organizations) {
        console.log(`${o.id === current?.id ? pc.green("●") : " "} ${pc.bold(o.slug)}  ${o.name} ${pc.dim(`· ${o.role}`)}`);
      }
      if (!current) console.log(pc.dim("\nNo default set. Run `uivoid org use <slug>`."));
    });

  org.command("use")
    .description("Set the organization commands use when --org isn't passed")
    .argument("<org>", "organization slug or id")
    .option(...TOKEN_OPTION)
    .action(async (flag: string, options: CommonOptions) => {
      const config = await authenticatedConfig(options.token);
      const me = await new UivoidApi(config).me();
      const chosen = resolveOrg(me.organizations, flag, config.organization);
      await storeDefaultOrg(chosen);
      console.log(`${pc.green("✓")} Default organization is now ${pc.bold(chosen.name)} ${pc.dim(`(${chosen.slug} · ${chosen.role})`)}`);
    });

  const team = program.command("team").description("See and manage who belongs to an organization");

  team.command("list")
    .description("List members, and pending invites if you're an owner or admin")
    .option(...ORG_OPTION)
    .option(...TOKEN_OPTION)
    .option(...JSON_OPTION)
    .action(async (options: CommonOptions) => {
      const { api, org } = await orgContext(options);
      const { members } = await api.listMembers(org.id);
      const invitations = MANAGE_ROLES.includes(org.role) ? (await api.listInvitations(org.id)).invitations : null;
      if (options.json) {
        console.log(JSON.stringify({ organization: org, members, invitations }));
        return;
      }
      console.log(`${pc.bold(org.name)} ${pc.dim(`· you are ${org.role}`)}`);
      for (const member of members) console.log(`  ${member.email}  ${pc.dim(member.role)}`);
      if (invitations?.length) {
        console.log(pc.bold("\nPending invites"));
        for (const invite of invitations) {
          console.log(`  ${invite.email}  ${pc.dim(`${invite.role} · expires in ${expiresIn(invite.expires_at)}`)}`);
        }
      }
    });

  team.command("invite")
    .description("Create an invite link for someone to join the organization")
    .argument("<email>", "email address the invite is for; only that account can accept it")
    .option("--role <role>", "owner, admin or member", "member")
    .option(...ORG_OPTION)
    .option(...TOKEN_OPTION)
    .option(...JSON_OPTION)
    .action(async (email: string, options: CommonOptions & { role: string }) => {
      const role = parseRole(options.role);
      const { api, org } = await orgContext(options);
      const invitation = await api.createInvitation(org.id, email, role);
      if (options.json) {
        console.log(JSON.stringify(invitation));
        return;
      }
      console.log(`${pc.green("✓")} Invited ${pc.bold(invitation.email)} to ${pc.bold(org.name)} as ${invitation.role}`);
      console.log(`\n  ${pc.cyan(invitation.invite_url)}\n`);
      console.log(pc.dim(`Send this link to them yourself. It works once, only for ${invitation.email}, and expires in ${expiresIn(invitation.expires_at)}. Inviting the same email again replaces it.`));
    });

  team.command("revoke")
    .description("Cancel a pending invite")
    .argument("<email-or-id>", "the invitee's email or the invite id")
    .option(...ORG_OPTION)
    .option(...TOKEN_OPTION)
    .action(async (emailOrId: string, options: CommonOptions) => {
      const { api, org } = await orgContext(options);
      const invitation = findInvitation((await api.listInvitations(org.id)).invitations, emailOrId);
      await api.revokeInvitation(org.id, invitation.id);
      console.log(`${pc.green("✓")} Revoked the invite for ${pc.bold(invitation.email)}`);
    });

  team.command("role")
    .description("Change a member's role (owners only)")
    .argument("<email>", "the member's email")
    .argument("<role>", "owner, admin or member")
    .option(...ORG_OPTION)
    .option(...TOKEN_OPTION)
    .action(async (email: string, roleValue: string, options: CommonOptions) => {
      const role = parseRole(roleValue);
      const { api, org } = await orgContext(options);
      const member = findMember((await api.listMembers(org.id)).members, email);
      const updated = await api.changeMemberRole(org.id, member.user_id, role);
      console.log(`${pc.green("✓")} ${pc.bold(updated.email)} is now ${updated.role} in ${org.name}`);
    });

  team.command("remove")
    .description("Remove a member from the organization")
    .argument("<email>", "the member's email")
    .option("--yes", "skip the confirmation prompt")
    .option(...ORG_OPTION)
    .option(...TOKEN_OPTION)
    .action(async (email: string, options: CommonOptions) => {
      const { api, me, org } = await orgContext(options);
      const member = findMember((await api.listMembers(org.id)).members, email);
      if (member.user_id === me.id) throw new Error("To remove yourself, use `uivoid team leave`.");
      if (!(await confirmOrRequireYes(options, `Remove ${member.email} from ${org.name}? They lose access to its projects and MCP servers.`))) return;
      await api.removeMember(org.id, member.user_id);
      console.log(`${pc.green("✓")} Removed ${pc.bold(member.email)} from ${org.name}`);
    });

  team.command("leave")
    .description("Leave an organization")
    .option("--yes", "skip the confirmation prompt")
    .option(...ORG_OPTION)
    .option(...TOKEN_OPTION)
    .action(async (options: CommonOptions) => {
      const { api, me, org } = await orgContext(options);
      if (!(await confirmOrRequireYes(options, `Leave ${org.name}? You lose access to its projects and MCP servers.`))) return;
      await api.removeMember(org.id, me.id);
      if ((await readConfig()).organization?.id === org.id) await storeDefaultOrg(undefined);
      console.log(`${pc.green("✓")} You left ${pc.bold(org.name)}`);
    });

  const invite = program.command("invite").description("Respond to an invite someone sent you");

  invite.command("accept")
    .description("Join an organization using an invite link")
    .argument("<link>", "the invite link (or just its token)")
    .option("--use", "make the organization your default without asking")
    .option(...TOKEN_OPTION)
    .option(...JSON_OPTION)
    .action(async (link: string, options: CommonOptions & { use?: boolean }) => {
      const token = parseInviteToken(link);
      const config = await authenticatedConfig(options.token);
      const { organization } = await new UivoidApi(config).acceptInvitation(token);
      let makeDefault = Boolean(options.use);
      if (!makeDefault && !options.json && process.stdin.isTTY) {
        makeDefault = await confirm({ message: `Make ${organization.name} your default organization?`, default: true });
      }
      if (makeDefault) await storeDefaultOrg(organization);
      if (options.json) {
        console.log(JSON.stringify({ organization, default: makeDefault }));
        return;
      }
      console.log(`${pc.green("✓")} Joined ${pc.bold(organization.name)} as ${organization.role}`);
      if (makeDefault) console.log(pc.dim(`Default organization is now ${organization.slug}.`));
      else console.log(pc.dim(`Use it with --org ${organization.slug}, or run \`uivoid org use ${organization.slug}\`.`));
    });
}
```

- [ ] **Step 2: Wire up the commands and update `login`, `whoami` and `create` in `src/cli.ts`.**

1. Add these imports next to the other local imports:

```ts
import { defaultOrg, resolveOrg, toStoredOrg } from "./orgs.js";
import { registerTeamCommands } from "./team-commands.js";
```

2. In the `login` action, replace `if (me.organizations[0]) next.organization = me.organizations[0];` with:

```ts
    const current = defaultOrg(me.organizations, next.organization) ?? me.organizations[0];
    if (current) next.organization = toStoredOrg(current);
```

3. Replace the body of the `whoami` action (the part after `const me = ...`) with:

```ts
    const current = defaultOrg(me.organizations, config.organization);
    if (json) {
      console.log(JSON.stringify({ email: me.email, organization: current ?? null, role: current?.role ?? null, organizations: me.organizations }));
    } else {
      console.log(`${me.email}${current ? ` · ${current.name} (${current.role})` : ""}`);
      if (me.organizations.length > 1) console.log(pc.dim(`Member of ${me.organizations.length} organizations — \`uivoid org list\` to see them, --org to pick one.`));
    }
```

4. In the `create` command:
   - Add `.option("--org <org>", "organization to create the project in (slug or id; defaults to the one set with `uivoid org use`)")` after the `--token` option.
   - Add `org?: string;` to the action's `options` type.
   - Replace

     ```ts
         const account = { email: me.email, organization: me.organizations[0] ?? null };
     ```

     with:

     ```ts
         const organization = resolveOrg(me.organizations, options.org, config.organization);
         const account = { email: me.email, organization };
     ```

   - Replace `const project = await api.createProject(subdomain);` with the block below. A member without write access now gets a 403 here, and without this the spinner would keep running:

     ```ts
         let project: Project;
         try {
           project = await api.createProject(subdomain, organization.id);
         } catch (error) {
           createSpinner.fail(`Could not create ${subdomain} in ${organization.name}`);
           throw error;
         }
     ```

     Add `Project` to the existing `import type { ... } from "./types.js"` line in `cli.ts`.

5. Immediately before `program.configureOutput(...)`, add:

```ts
registerTeamCommands(program, authenticatedConfig);
```

- [ ] **Step 3: Typecheck, test and build.**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck is clean, all tests pass, and the build succeeds.

- [ ] **Step 4: Check the help output.**

Run: `node dist/cli.js --help && node dist/cli.js team --help && node dist/cli.js team invite --help && node dist/cli.js invite accept --help && node dist/cli.js create --help | grep -- --org`
Expected:
- Top-level help lists `org`, `team` and `invite`.
- `team` help lists `list`, `invite`, `revoke`, `role`, `remove` and `leave`.
- `team invite` help shows `--role <role>` defaulting to `"member"`.
- `create` help shows `--org <org>`.

- [ ] **Step 5: Commit.**

```bash
git add src/team-commands.ts src/cli.ts
git commit -m "Add org, team and invite commands and create --org"
```

---

### Task 4: Docs and an end-to-end smoke run against the local backend

**Files:**
- Modify: `README.md` (the `## Commands` block and `## Backend contract` list, plus a new `### Teams and organizations` subsection)
- Modify: `skill/uivoid/SKILL.md` (the whoami/account paragraph)

- [ ] **Step 1: Update the README.**

1. In the `## Commands` code block, add these lines after `npx uivoid whoami [--json]`:

```bash
npx uivoid org list [--json]
npx uivoid org use <slug>
npx uivoid team list [--org SLUG] [--json]
npx uivoid team invite <email> [--role member|admin|owner] [--org SLUG] [--json]
npx uivoid team revoke <email-or-invite-id> [--org SLUG]
npx uivoid team role <email> <owner|admin|member> [--org SLUG]
npx uivoid team remove <email> [--org SLUG] [--yes]
npx uivoid team leave [--org SLUG] [--yes]
npx uivoid invite accept <link> [--use] [--json]
```

   Also change `npx uivoid create [name] --no-discover` to `npx uivoid create [name] [--org SLUG] --no-discover`.

2. Directly before `### Outbound credentials`, add:

```markdown
### Teams and organizations

An account can belong to several organizations. Commands that act on one take `--org <slug>`; without it they use the default set by `uivoid org use <slug>` (or your only organization). `uivoid whoami` shows the current default and your role.

Roles: **owner** (everything, including roles and owner invites), **admin** (manage projects, keys and credentials; invite members and admins) and **member** (read-only in the control plane; can use the organization's MCP servers with read and write tools, but not destructive ones).

`uivoid team invite teammate@company.com --role admin` prints a one-time invite link. Send it yourself — it works only for that email address and expires after 7 days; inviting the same address again replaces it. The teammate runs `uivoid invite accept <link>` (or opens the link in the portal).
```

3. In `## Backend contract`, add these bullets after `- PATCH /api/projects/:id/credentials`:

```markdown
- `GET /api/orgs/:id/members`, `PATCH|DELETE /api/orgs/:id/members/:userId`
- `GET|POST /api/orgs/:id/invitations`, `DELETE /api/orgs/:id/invitations/:inviteId`
- `POST /api/invitations/:token/accept`
```

   Also add `(accepts organization_id)` after the existing `` - `POST /api/projects` `` bullet.

- [ ] **Step 2: Update the skill.** In `skill/uivoid/SKILL.md`, after the sentence `Resolve a wrong or ambiguous account before provisioning.` in the whoami paragraph, add:

```markdown
If the account belongs to several organizations, confirm which one the project belongs to and pass `--org <slug>` to `uivoid create` (`npx uivoid org list` shows them). Creating projects requires the owner or admin role in that organization.
```

- [ ] **Step 3: Start the backend for a smoke run.** In another shell, run `cd /Users/corri/uivoid-be && git checkout feature/team-invites` (verify with `git branch --show-current`; don't switch if it's already on it). Then:

```bash
cd /Users/corri/uivoid-be && docker compose up -d db && DJANGO_ENV=development uv run python manage.py migrate && DJANGO_ENV=development uv run python manage.py runserver 127.0.0.1:8765
```

Run the server as a background process and stop it when done.

- [ ] **Step 4: Run the end-to-end smoke test.** Use throwaway users and an isolated config file. Everything below is local only:

```bash
cd /Users/corri/uivoid-cli
export UIVOID_API_URL=http://127.0.0.1:8765 UIVOID_PORTAL_URL=http://localhost:3000
S=$(date +%s)
OWNER=$(curl -s -X POST $UIVOID_API_URL/api/signup -H 'Content-Type: application/json' -d "{\"email\":\"owner-$S@smoke.test\",\"password\":\"correct-horse-battery-staple\",\"org_name\":\"Smoke $S\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
GUEST=$(curl -s -X POST $UIVOID_API_URL/api/signup -H 'Content-Type: application/json' -d "{\"email\":\"guest-$S@smoke.test\",\"password\":\"correct-horse-battery-staple\",\"org_name\":\"Guest $S\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
UIVOID_CONFIG_PATH=/tmp/uivoid-owner.json node dist/cli.js login --token $OWNER
UIVOID_CONFIG_PATH=/tmp/uivoid-owner.json node dist/cli.js team invite guest-$S@smoke.test --role member --json | tee /tmp/invite.json
LINK=$(node -pe 'JSON.parse(require("fs").readFileSync("/tmp/invite.json")).invite_url')
UIVOID_CONFIG_PATH=/tmp/uivoid-owner.json node dist/cli.js team list
UIVOID_CONFIG_PATH=/tmp/uivoid-guest.json node dist/cli.js login --token $GUEST
UIVOID_CONFIG_PATH=/tmp/uivoid-guest.json node dist/cli.js invite accept "$LINK" --json
UIVOID_CONFIG_PATH=/tmp/uivoid-guest.json node dist/cli.js org list
UIVOID_CONFIG_PATH=/tmp/uivoid-guest.json node dist/cli.js whoami
UIVOID_CONFIG_PATH=/tmp/uivoid-guest.json node dist/cli.js create smoke-member-$S --org smoke-$S --no-discover; echo "exit=$?"
UIVOID_CONFIG_PATH=/tmp/uivoid-guest.json node dist/cli.js create smoke-guest-$S --org guest-$S --no-discover
UIVOID_CONFIG_PATH=/tmp/uivoid-owner.json node dist/cli.js team role guest-$S@smoke.test admin
UIVOID_CONFIG_PATH=/tmp/uivoid-owner.json node dist/cli.js team remove guest-$S@smoke.test --yes
UIVOID_CONFIG_PATH=/tmp/uivoid-owner.json node dist/cli.js team list --json
rm -f /tmp/uivoid-owner.json /tmp/uivoid-guest.json /tmp/invite.json
```

Expected:
- `team invite` prints JSON with an `invite_url` ending in `/invite/<token>`.
- `invite accept` prints `{"organization":{...,"role":"member"},"default":false}`.
- The guest's `org list` shows two orgs.
- `create ... --org smoke-$S` fails with `your role can't change this project` and `exit=1`.
- `create ... --org guest-$S` succeeds.
- `team role` prints `is now admin`.
- The final `team list --json` has only the owner.

Org slugs are derived from the org name (`Smoke $S` → `smoke-$S`). If a slug differs, read it from `org list` and adjust. Paste the full output into the report. If any step deviates, stop and report the deviation. Don't change the backend.

- [ ] **Step 5: Stop the backend server.**

- [ ] **Step 6: Run the final checks and commit.**

Run: `npm run typecheck && npm test && npm run build`
Expected: everything passes.

```bash
git add README.md skill/uivoid/SKILL.md
git commit -m "Document team, org and invite commands"
```
