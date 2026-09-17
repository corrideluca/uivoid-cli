# Agent-Friendly `create` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps a coding-agent session hit trying to run `uivoid create` non-interactively: no way to set the outbound static credential, no non-interactive endpoint-selection fallback other than all-or-nothing `--yes`, a cryptic crash instead of a clear error when stdin isn't a TTY, no way to fix a credential after the fact, and no machine-readable output.

**Architecture:** Extract the new branching logic (credential-flag parsing, non-interactive endpoint selection) into small pure functions in new modules so they're unit-testable with `node:test` without spawning the CLI as a subprocess — following the existing pattern in `src/discovery.ts`/`test/discovery.test.ts`. `src/cli.ts`'s `.action()` closures stay thin wrappers around those functions plus I/O. This plan assumes **`docs/superpowers/plans/2026-09-17-outbound-credential-storage.md` in the sibling `uivoid-be` repo has already landed** — `POST /api/projects/:id/keys` accepts `secret`/`header_name`, and `PATCH /api/projects/:id/credentials` exists.

**Tech Stack:** TypeScript, Commander, `@inquirer/prompts`, `node:test`.

## Global Constraints

- Every new flag must work with zero TTY (stdin not a terminal) — either by doing the right thing non-interactively, or by calling `program.error(...)` with a specific, actionable message. Never let a missing prompt hang or throw `User force closed the prompt with 0 null`.
- Never print a raw secret to `--json` output except the one-time generated outbound key immediately after creation (the whole point of showing it once), and never log it anywhere else (no `console.warn`/error paths).
- Keep `npm run typecheck` and `npm test` passing after every task.

---

### Task 1: Pure credential-flag parsing (`--auth-key` / `--auth-header`)

**Files:**
- Create: `src/credentials.ts`
- Test: `test/credentials.test.ts`

**Interfaces:**
- Produces: `parseCredentialOption(options: { authKey?: string; authHeader?: string }): OutboundCredential | undefined`, `interface OutboundCredential { secret: string; headerName?: string }`. Task 3 (`create` command) and Task 4 (`credentials` command) both import this.

- [ ] **Step 1: Write the failing tests**

```typescript
// test/credentials.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseCredentialOption } from "../src/credentials.js";

test("returns undefined when neither flag is set", () => {
  assert.equal(parseCredentialOption({}), undefined);
});

test("--auth-key becomes a secret with no explicit header name", () => {
  assert.deepEqual(parseCredentialOption({ authKey: "sk_live_abc" }), { secret: "sk_live_abc" });
});

test("--auth-header splits on the first colon into header name and value", () => {
  assert.deepEqual(
    parseCredentialOption({ authHeader: "x-api-key:sk_live_abc" }),
    { headerName: "x-api-key", secret: "sk_live_abc" }
  );
});

test("--auth-header value may itself contain colons", () => {
  assert.deepEqual(
    parseCredentialOption({ authHeader: "Authorization:Bearer abc:def" }),
    { headerName: "Authorization", secret: "Bearer abc:def" }
  );
});

test("rejects --auth-header with no colon", () => {
  assert.throws(
    () => parseCredentialOption({ authHeader: "not-a-header" }),
    /must be formatted "Header-Name:value"/
  );
});

test("rejects both --auth-key and --auth-header together", () => {
  assert.throws(
    () => parseCredentialOption({ authKey: "a", authHeader: "x:b" }),
    /Use either --auth-key or --auth-header, not both/
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/corri/uivoid-cli && npm test`
Expected: FAIL with `Cannot find module '../src/credentials.js'`

- [ ] **Step 3: Implement**

```typescript
// src/credentials.ts
export interface CredentialOption {
  authKey?: string;
  authHeader?: string;
}

export interface OutboundCredential {
  secret: string;
  headerName?: string;
}

export function parseCredentialOption(options: CredentialOption): OutboundCredential | undefined {
  if (options.authKey && options.authHeader) {
    throw new Error("Use either --auth-key or --auth-header, not both.");
  }
  if (options.authHeader) {
    const separatorIndex = options.authHeader.indexOf(":");
    if (separatorIndex < 1) {
      throw new Error(`--auth-header must be formatted "Header-Name:value", got ${JSON.stringify(options.authHeader)}`);
    }
    return {
      headerName: options.authHeader.slice(0, separatorIndex).trim(),
      secret: options.authHeader.slice(separatorIndex + 1).trim(),
    };
  }
  if (options.authKey) return { secret: options.authKey };
  return undefined;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/corri/uivoid-cli && npm test`
Expected: PASS (6 new tests, plus the existing `discovery.test.ts` tests still passing)

- [ ] **Step 5: Commit**

```bash
git add src/credentials.ts test/credentials.test.ts
git commit -m "Add pure parser for --auth-key/--auth-header

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Pure non-interactive endpoint selection (`--include` / `--exclude-destructive`)

**Files:**
- Create: `src/selection.ts`
- Test: `test/selection.test.ts`

**Interfaces:**
- Produces: `interface SelectableTool { name: string; scope: string }`, `resolveNonInteractiveSelection(candidates: SelectableTool[], options: { yes?: boolean; include?: string; excludeDestructive?: boolean }): string[] | undefined` (returns `undefined` when none of the three flags are set, meaning "fall back to the interactive checkbox or fail if there's no TTY"). Task 3 (`create` command) imports this.

- [ ] **Step 1: Write the failing tests**

```typescript
// test/selection.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { resolveNonInteractiveSelection } from "../src/selection.js";

const candidates = [
  { name: "get_customer", scope: "read" },
  { name: "create_order", scope: "write" },
  { name: "delete_customer", scope: "destructive" },
];

test("returns undefined when no selection flag is set", () => {
  assert.equal(resolveNonInteractiveSelection(candidates, {}), undefined);
});

test("--yes selects everything including destructive", () => {
  assert.deepEqual(
    resolveNonInteractiveSelection(candidates, { yes: true }),
    ["get_customer", "create_order", "delete_customer"]
  );
});

test("--exclude-destructive selects everything except destructive", () => {
  assert.deepEqual(
    resolveNonInteractiveSelection(candidates, { excludeDestructive: true }),
    ["get_customer", "create_order"]
  );
});

test("--include selects only the named tools, in candidate order", () => {
  assert.deepEqual(
    resolveNonInteractiveSelection(candidates, { include: "delete_customer,get_customer" }),
    ["get_customer", "delete_customer"]
  );
});

test("--include rejects unknown tool names with the available list", () => {
  assert.throws(
    () => resolveNonInteractiveSelection(candidates, { include: "get_customer,not_a_tool" }),
    /Unknown tool name\(s\) in --include: not_a_tool\. Available: get_customer, create_order, delete_customer/
  );
});

test("rejects combining more than one selection flag", () => {
  assert.throws(
    () => resolveNonInteractiveSelection(candidates, { yes: true, excludeDestructive: true }),
    /Use only one of --yes, --include, or --exclude-destructive/
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/corri/uivoid-cli && npm test`
Expected: FAIL with `Cannot find module '../src/selection.js'`

- [ ] **Step 3: Implement**

```typescript
// src/selection.ts
export interface SelectableTool {
  name: string;
  scope: string;
}

export interface SelectionOptions {
  yes?: boolean;
  include?: string;
  excludeDestructive?: boolean;
}

function countSelectionModes(options: SelectionOptions): number {
  return [options.yes, Boolean(options.include), options.excludeDestructive].filter(Boolean).length;
}

export function resolveNonInteractiveSelection(
  candidates: SelectableTool[],
  options: SelectionOptions
): string[] | undefined {
  if (countSelectionModes(options) > 1) {
    throw new Error("Use only one of --yes, --include, or --exclude-destructive.");
  }
  if (options.include) {
    const wanted = options.include.split(",").map((value) => value.trim()).filter(Boolean);
    const known = new Set(candidates.map((tool) => tool.name));
    const unknown = wanted.filter((name) => !known.has(name));
    if (unknown.length) {
      throw new Error(`Unknown tool name(s) in --include: ${unknown.join(", ")}. Available: ${candidates.map((tool) => tool.name).join(", ")}`);
    }
    return candidates.map((tool) => tool.name).filter((name) => wanted.includes(name));
  }
  if (options.excludeDestructive) {
    return candidates.filter((tool) => tool.scope !== "destructive").map((tool) => tool.name);
  }
  if (options.yes) return candidates.map((tool) => tool.name);
  return undefined;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/corri/uivoid-cli && npm test`
Expected: PASS (6 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/selection.ts test/selection.test.ts
git commit -m "Add pure non-interactive endpoint selection (--include/--exclude-destructive)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire `create` — credentials, non-interactive selection, TTY detection, whoami-first-line, `--json`

**Files:**
- Modify: `src/api.ts:56-61` (`createKey`)
- Modify: `src/cli.ts:57-123` (`whoami`, `create`)
- Test: manual verification only (the branching logic itself is covered by Tasks 1–2's unit tests; `cli.ts`'s `.action()` has no existing test harness — see Global Constraints in the parent conversation for why a full subprocess harness is out of scope here)

**Interfaces:**
- Consumes: `parseCredentialOption`, `OutboundCredential` (Task 1); `resolveNonInteractiveSelection` (Task 2).
- Produces: nothing new consumed elsewhere in this repo — this is the top-level command.

- [ ] **Step 1: Update `createKey` to forward an optional credential**

In `src/api.ts`, replace lines 56-61:

```typescript
  createKey(projectId: string, credential?: { secret: string; headerName?: string }): Promise<{ id: string; key: string }> {
    return this.request(`api/projects/${projectId}/keys`, {
      method: "POST",
      body: JSON.stringify({
        direction: "outbound", scopes: [], secret_type: "bearer",
        ...(credential ? { secret: credential.secret, ...(credential.headerName ? { header_name: credential.headerName } : {}) } : {}),
      }),
    });
  }
```

- [ ] **Step 2: Manually verify the API client change compiles**

Run: `cd /Users/corri/uivoid-cli && npm run typecheck`
Expected: PASS (no callers pass a second argument yet, which is fine — it's optional)

- [ ] **Step 3: Add `--json` to `whoami`**

In `src/cli.ts`, replace lines 57-61:

```typescript
program.command("whoami")
  .description("Show the current UIvoid account")
  .option("--json", "print a machine-readable JSON object instead of formatted text")
  .action(async ({ json }: { json?: boolean }) => {
    const config = await authenticatedConfig();
    const me = await new UivoidApi(config).me();
    if (json) {
      console.log(JSON.stringify({ email: me.email, organization: me.organizations[0] ?? null }));
    } else {
      console.log(`${me.email}${me.organizations[0] ? ` · ${me.organizations[0].name}` : ""}`);
    }
  });
```

- [ ] **Step 4: Rewrite `create`**

In `src/cli.ts`, add these two imports alongside the existing ones at the top of the file:

```typescript
import { parseCredentialOption } from "./credentials.js";
import type { OutboundCredential } from "./credentials.js";
import { resolveNonInteractiveSelection } from "./selection.js";
```

Replace the entire `create` command block (lines 63-123) with:

```typescript
program.command("create")
  .description("Create a project and map an existing OpenAPI surface")
  .argument("[name]", "project name and desired uivoid.app subdomain")
  .option("--base-url <url>", "base URL of the existing API")
  .option("--openapi <url>", "OpenAPI URL or path")
  .option("--token <token>", "personal access token (or use UIVOID_TOKEN)")
  .option("--auth-key <value>", "static credential your API expects, sent as \"Authorization: Bearer <value>\"")
  .option("--auth-header <header>", "custom outbound header, formatted \"Header-Name:value\"")
  .option("--yes", "accept all discovered endpoints, including destructive ones")
  .option("--include <names>", "comma-separated tool names to expose non-interactively")
  .option("--exclude-destructive", "expose all discovered endpoints except destructive (DELETE) ones")
  .option("--no-discover", "create the project without mapping endpoints")
  .option("--json", "print a single machine-readable JSON object instead of formatted text")
  .action(async (providedName: string | undefined, options: {
    baseUrl?: string; openapi?: string; token?: string; authKey?: string; authHeader?: string;
    yes?: boolean; include?: string; excludeDestructive?: boolean; discover: boolean; json?: boolean;
  }) => {
    let credential: OutboundCredential | undefined;
    try {
      credential = parseCredentialOption(options);
    } catch (error) {
      program.error((error as Error).message);
    }

    const interactive = Boolean(process.stdin.isTTY);
    const config = await authenticatedConfig(options.token);
    const api = new UivoidApi(config);
    const me = await api.me();
    const account = `${me.email}${me.organizations[0] ? ` · ${me.organizations[0].name}` : ""}`;
    if (!options.json) console.log(pc.dim(`Signed in as ${account}`));

    let name = providedName;
    if (!name) {
      if (!interactive) program.error("Project name is required when running non-interactively (no TTY detected). Pass it as an argument: `uivoid create <name> ...`.");
      name = await input({ message: "Project name", validate: (value) => value.trim() ? true : "Enter a project name" });
    }
    const subdomain = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    let baseUrl = options.baseUrl;
    if (options.discover && !baseUrl) {
      if (!interactive) program.error("Base URL is required when running non-interactively (no TTY detected). Pass it with --base-url <url>, or use --no-discover to create the project without mapping endpoints.");
      baseUrl = await input({ message: "Existing API base URL", validate: validHttpUrl });
    }
    if (baseUrl) baseUrl = normalizeUrl(baseUrl);

    const createSpinner = ora("Creating project").start();
    const project = await api.createProject(subdomain);
    createSpinner.succeed(`Created ${pc.bold(project.subdomain)}`);

    let mapped: ToolDefinition[] = [];
    let setupComplete = !options.discover;
    let generatedKey: string | undefined;
    if (options.discover && baseUrl) {
      const discoverySpinner = ora("Discovering API endpoints").start();
      try {
        const discovered = await discoverOpenApi(baseUrl, options.openapi);
        discoverySpinner.succeed(`Found OpenAPI document at ${discovered.url}`);
        const key = await api.createKey(project.id, credential);
        if (!credential) generatedKey = key.key;
        const candidates = toolsFromOpenApi(discovered.document, baseUrl, key.id);
        if (!candidates.length) throw new Error("The OpenAPI document contains no supported operations.");

        let nonInteractive: string[] | undefined;
        try {
          nonInteractive = resolveNonInteractiveSelection(candidates, options);
        } catch (error) {
          program.error((error as Error).message);
        }
        let selected: string[];
        if (nonInteractive) {
          selected = nonInteractive;
        } else if (interactive) {
          selected = await checkbox({
            message: "Select endpoints to expose",
            choices: candidates.map((tool) => ({ name: `${tool.name} ${pc.dim(`${tool.method} · ${tool.scope}`)}`, value: tool.name, checked: tool.scope !== "destructive" })),
            required: true,
          });
        } else {
          program.error("No interactive terminal detected. Use --yes, --include <tool1,tool2,...>, --exclude-destructive, or --no-discover instead.");
        }
        mapped = candidates.filter((tool) => selected.includes(tool.name));
        if (!nonInteractive && mapped.some((tool) => tool.scope === "destructive")) {
          const approved = await confirm({ message: "Expose the selected destructive operations?", default: false });
          if (!approved) mapped = mapped.filter((tool) => tool.scope !== "destructive");
        }
        const mappingSpinner = ora(`Mapping ${mapped.length} endpoints`).start();
        for (const tool of mapped) await api.createTool(project.id, tool);
        mappingSpinner.succeed(`Mapped ${mapped.length} scoped tools`);
        setupComplete = true;
      } catch (error) {
        discoverySpinner.stop();
        console.warn(`${pc.yellow("!")} Project created, but endpoint discovery did not finish: ${(error as Error).message}`);
      }
    }

    if (setupComplete) {
      const activateSpinner = ora("Activating MCP server").start();
      await api.activateProject(project.id);
      activateSpinner.succeed("MCP server active");
    }

    if (options.json) {
      console.log(JSON.stringify({
        account, project: project.subdomain, status: setupComplete ? "active" : "created",
        mcpUrl: setupComplete ? project.mcp_url : null, toolCount: mapped.length,
        scopes: {
          read: mapped.filter((tool) => tool.scope === "read").length,
          write: mapped.filter((tool) => tool.scope === "write").length,
          destructive: mapped.filter((tool) => tool.scope === "destructive").length,
        },
        ...(generatedKey ? { outboundKey: generatedKey } : {}),
      }));
      return;
    }

    if (setupComplete) {
      console.log(`\n${pc.green(pc.bold("Ready"))}  ${pc.cyan(project.mcp_url)}`);
      console.log(pc.dim(`Auth: organization login · ${mapped.length} tool${mapped.length === 1 ? "" : "s"} mapped`));
    } else {
      console.log(`\n${pc.yellow(pc.bold("Created, not active"))}  Endpoint setup must finish before ${project.mcp_url} can accept connections.`);
    }
    if (generatedKey) {
      console.log(`\n${pc.yellow("Outbound credential (shown once, save it now)")}  ${generatedKey}`);
      console.log(pc.dim(`Configure your API to accept this as: Authorization: Bearer ${generatedKey}`));
      console.log(pc.dim("Target API already has its own key instead? `uivoid credentials <project> --auth-key <value>` sets it explicitly."));
    }
  });
```

Note the `discoverySpinner` variable is declared as the first statement inside the `if (options.discover && baseUrl)` block, *before* the `try`, exactly as in the current code — it must stay there so the `catch` block below can call `.stop()` on it.

- [ ] **Step 5: Typecheck**

Run: `cd /Users/corri/uivoid-cli && npm run typecheck`
Expected: PASS. If TS complains about `selected` or `name`/`baseUrl` possibly being used before assignment, double check every `program.error(...)` call sits in its own `if` statement (not inlined in a ternary) — `program.error` is typed `(message: string) => never` in Commander, and TypeScript only narrows control flow correctly when it's a full statement, not part of a ternary expression.

- [ ] **Step 6: Manual smoke test against a local/dev uivoid-be**

With `uivoid-be` running locally and `UIVOID_API_URL` pointed at it:

```bash
cd /Users/corri/uivoid-cli
npm run build
echo | node dist/cli.js create smoke-test --base-url https://httpbin.org --exclude-destructive --json
```

Expected: valid single-line JSON on stdout (no spinner text mixed in), or a clear `program.error` message if `httpbin.org` has no OpenAPI document (in which case swap in a test API you control that does).

Also verify the TTY-detection message directly:

```bash
echo | node dist/cli.js create
```

Expected: exits with `Project name is required when running non-interactively (no TTY detected)...` — not a hang, not `User force closed the prompt with 0 null`.

- [ ] **Step 7: Commit**

```bash
git add src/api.ts src/cli.ts
git commit -m "Make create work non-interactively: credentials, --include/--exclude-destructive, --json

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `credentials` command — fix a bad/missing key without recreating the project

**Files:**
- Modify: `src/api.ts` (add `listProjects`, `setOutboundCredential`)
- Modify: `src/cli.ts` (add `credentials` command)

**Interfaces:**
- Consumes: `parseCredentialOption` (Task 1), `PATCH /api/projects/:id/credentials` (backend plan, Task 3).

- [ ] **Step 1: Add the two API methods**

In `src/api.ts`, add after `createKey` (which Task 3 already modified):

```typescript
  listProjects(): Promise<{ projects: Project[] }> {
    return this.request("api/projects");
  }

  setOutboundCredential(projectId: string, secret: string, headerName?: string): Promise<{ id: string; header_name: string }> {
    return this.request(`api/projects/${projectId}/credentials`, {
      method: "PATCH",
      body: JSON.stringify({ secret, ...(headerName ? { header_name: headerName } : {}) }),
    });
  }
```

- [ ] **Step 2: Add the command**

In `src/cli.ts`, add after the `create` command block (before `program.command("prompt")`):

```typescript
program.command("credentials")
  .description("Set or update the outbound credential uivoid uses when calling a project's API")
  .argument("<project>", "project subdomain")
  .option("--auth-key <value>", "static credential your API expects, sent as \"Authorization: Bearer <value>\"")
  .option("--auth-header <header>", "custom outbound header, formatted \"Header-Name:value\"")
  .option("--token <token>", "personal access token (or use UIVOID_TOKEN)")
  .option("--json", "print a machine-readable JSON object instead of formatted text")
  .action(async (projectName: string, options: { authKey?: string; authHeader?: string; token?: string; json?: boolean }) => {
    let credential: OutboundCredential | undefined;
    try {
      credential = parseCredentialOption(options);
    } catch (error) {
      program.error((error as Error).message);
    }
    if (!credential) program.error('Pass --auth-key <value> or --auth-header "Header-Name:value".');

    const config = await authenticatedConfig(options.token);
    const api = new UivoidApi(config);
    const { projects } = await api.listProjects();
    const project = projects.find((candidate) => candidate.subdomain === projectName);
    if (!project) program.error(`No project named ${JSON.stringify(projectName)} in your organization. Run \`uivoid whoami\` to confirm you're signed in to the right account.`);

    await api.setOutboundCredential(project.id, credential.secret, credential.headerName);
    if (options.json) {
      console.log(JSON.stringify({ project: project.subdomain, headerName: credential.headerName ?? "Authorization" }));
    } else {
      console.log(`${pc.green("✓")} Updated the outbound credential for ${pc.bold(project.subdomain)}`);
    }
  });
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/corri/uivoid-cli && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Manual smoke test**

Against a local `uivoid-be` with a project already created:

```bash
cd /Users/corri/uivoid-cli && npm run build
node dist/cli.js credentials smoke-test --auth-key sk_live_rotated --json
```

Expected: `{"project":"smoke-test","headerName":"Authorization"}` printed, and re-running the project's tools now calls upstream with the new key (verify via the backend's `AuditLog` or by pointing `--base-url` at a local echo server).

- [ ] **Step 5: Commit**

```bash
git add src/api.ts src/cli.ts
git commit -m "Add credentials command to fix an outbound key without recreating the project

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Keep `uivoid prompt`'s bundled agent prompt in sync

**Files:**
- Modify: `src/prompt.ts`

**Interfaces:** none — this is copy only, consumed by `uivoid-portal`'s `cli/page.tsx` doc (which says `npx uivoid prompt` is "the same prompt" as the landing page button) and by whatever agent runs `npx uivoid prompt`.

- [ ] **Step 1: Replace the prompt text**

`src/prompt.ts` currently omits the whoami/non-interactive/portal-docs guidance that the landing-page copy prompt is being updated with in the sibling `uivoid` repo (`docs/superpowers/plans/2026-09-17-update-copy-prompt.md`). Replace the whole file with:

```typescript
export const integrationPrompt = `Integrate this project with uivoid: expose its existing API as scoped MCP tools.

0. Ask the user two things up front (don't guess):
   - BASE_URL of the API (e.g. https://myapp.vercel.app). Check for a deployed URL or an .env
     file, or ask directly — don't assume localhost.
   - Auth type on that API: none / static API key (a secret it already checks server-side) /
     OAuth-backed. If static key, get the actual value now — you'll need it in step 3.

1. Find the API's OpenAPI document at <BASE_URL>/openapi.json, /api/openapi.json, or
   /swagger.json.

2. Run \`npx uivoid whoami\`. Show the user the account/org it prints and confirm that's the
   right one before creating anything. Wrong account → tell the user to run
   \`npx uivoid logout && npx uivoid login\` themselves, then re-check.

3. Found an OpenAPI doc → run:
   \`npx uivoid create <name> --base-url <BASE_URL>\`
   Add \`--openapi <path>\` if the doc isn't at a default location, and \`--auth-key <value>\`
   (or \`--auth-header "Header-Name:value"\` for a non-Authorization header) if you collected a
   static key in step 0. No real TTY (a sandboxed/non-interactive shell)? The CLI detects this
   and tells you so; pick one of \`--include <op1>,<op2>,...\`, \`--exclude-destructive\`, or
   \`--yes\` (accepts everything including destructive ops — call this out to the user before
   using it). With a real interactive terminal, just run it and let the checkbox prompt drive.

4. Project name already taken → tell the user and ask for a different one, don't silently pick
   your own suffix.

5. No OpenAPI doc → check for existing API routes. None: stop, say there's nothing to
   integrate. Some: show them to the user with a one-line description each, ask which to
   expose, generate OpenAPI operations only for those (stable operationId, concise
   agent-facing description), then continue at step 3.

6. Report back: the MCP URL and a summary of what's exposed (tool count, scopes:
   read/write/destructive). 401s on first real use are almost always the outbound credential
   (step 0/3), not the MCP login — check \`npx uivoid credentials <name> --auth-key <value>\`
   before anything else. Full reference: https://portal.uivoid.app/docs/cli

Return the generated MCP URL and summarize the exposed read, write, and destructive tools.`;
```

- [ ] **Step 2: Manual check**

Run: `cd /Users/corri/uivoid-cli && npm run dev -- prompt`
Expected: prints the new prompt text verbatim, no template-literal escaping issues (watch for the backtick-quoted flag examples rendering correctly).

- [ ] **Step 3: Commit**

```bash
git add src/prompt.ts
git commit -m "Sync npx uivoid prompt with the updated landing-page integration prompt

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** ranked gap #1 (`--auth-key`/`--auth-header`) → Task 1 + 3; #2 (post-creation credential fix) → Task 4; #3 (`--include`/`--exclude-destructive`) → Task 2 + 3; #4 (TTY detection with a useful message) → Task 3; #5 (`--json` on `create`/`whoami`) → Task 3; #6 (print `whoami` identity first) → Task 3 (`Signed in as ...` line, also included as `account` in `--json`). The previously-undiscovered bug — the auto-generated outbound key was fetched but never shown to the user — is also fixed in Task 3 (`generatedKey` printed once, included in `--json` as `outboundKey`).
- **Not in this plan:** hardening `login`'s browser-based auth handshake (device-code confirmation) — flagged separately as a bigger, security-sensitive UX change touching the portal's OAuth callback page, not one of the six ranked CLI gaps.
- **Placeholder scan:** none found; every step has real, complete code.
- **Type consistency:** `OutboundCredential { secret, headerName }` and `resolveNonInteractiveSelection`'s `SelectableTool { name, scope }` are used identically across Tasks 1–4.
