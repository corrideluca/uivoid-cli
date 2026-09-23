---
name: uivoid
description: Connect an existing HTTP API to UIvoid and provision a dedicated MCP subdomain with scoped tools and authentication. Use when a user wants to expose their API through UIvoid, keep their API self-hosted, or run uivoid create.
---

# UIvoid MCP integration

Turn an existing HTTP API into a remote MCP service at `https://<project>.uivoid.app/mcp`, with selected operations and authentication. This workflow provisions a UIvoid project and dedicated subdomain, rather than generating standalone MCP server code. The existing API keeps its business logic and can remain self-hosted; UIvoid hosts the MCP gateway by default. It does not buy a domain, configure an arbitrary custom domain, or deploy a self-hosted MCP gateway.

Requires Node.js 20+, an HTTP API reachable by the UIvoid service, and a UIvoid account. Use the [portal](https://portal.uivoid.app) for account/project management and the [CLI repository](https://github.com/corrideluca/uivoid-cli) for current command documentation. A local-only API is not reachable by the hosted gateway without a separately arranged network path.

## 1. Inspect the existing API

- Read project instructions, routes, auth middleware, configuration, and deployment documentation. Find the actual API `BASE_URL`, route prefix, and authentication mechanism before asking the user to repeat information already available.
- If the URL is missing or ambiguous, ask: “Which deployed API BASE_URL should UIvoid call?” Also resolve the intended project/subdomain and endpoint selection when they are not clear from the request. Do not substitute the frontend or portal URL for the API URL.
- Look for an OpenAPI JSON document at `openapi.json`, `api/openapi.json`, or `swagger.json` relative to the base URL, or at a documented location. Cross-check its security declarations against the real request-auth code.
- If no document exists, enumerate the actual routes and their inputs, outputs, auth, and side effects. Use the user's requested operations, asking for selection when needed. Generate a minimal OpenAPI document from those routes and serve it over HTTP within the authorized project scope. No API routes means there is nothing to map: report this rather than inventing endpoints.
- The current CLI fetches OpenAPI over HTTP and does not read filesystem paths or YAML. `--openapi` accepts an absolute URL or a URL-relative path. Discovery does not attach `--auth-key`/`--auth-header` credentials to the spec fetch; arrange an accessible spec without publishing secrets.
- Check that operation IDs normalize to unique snake_case tool names. Give operations accurate summaries and inline parameter/body schemas; the current mapper is limited and does not resolve `$ref` schemas. Ensure the base URL and path keys do not duplicate a route prefix.

## 2. Establish account and auth mode

Run `npx uivoid whoami` and report the account/org. If there is no session, use `npx uivoid login` for browser login through the portal. Resolve a wrong or ambiguous account before provisioning. If the account belongs to several organizations, confirm which one the project belongs to and pass `--org <slug>` to `uivoid create` (`npx uivoid org list` shows them). Creating projects requires the owner or admin role in that organization. Never request passwords in the conversation; use existing secret configuration or the user's local secret-entry workflow for credentials. Do not echo secrets into reports or commit them.

Separate CLI account login, MCP client authentication, and the credential forwarded to the existing API:

- **Static bearer credential:** pass `--auth-key "$API_TOKEN"` to `create`; this always sends `Authorization: Bearer ...`.
- **Custom header or another static Authorization scheme:** use `--auth-header "X-API-Key:$API_KEY"` or an appropriately configured `Authorization` header. Basic auth is not a bearer token.
- **Per-user JWT/OAuth:** preserve user identity with `oauth-config` after creation; do not replace user permissions with a shared service credential. Discover issuer, JWKS URL, audience, and provider endpoints from actual config. Obtain a client registration issued for this integration; do not invent client IDs or secrets. Cookie sessions alone are not automatically compatible with JWT passthrough.
- **No credential supplied:** `create` generates an outbound bearer key, displayed once (also present in JSON output). This does not automatically secure the target API. Save it through the user's secret-management workflow and configure the API to accept it when appropriate. For public APIs, verify that the added header is tolerated. In passthrough mode, complete the per-user setup before using the integration.

## 3. Provision the MCP subdomain and selected tools

Explain the concrete effect before execution: this creates and activates an organization-owned UIvoid project, assigns its subdomain, and registers tools that call the existing API. Proceed within the user's authorization.

For example, after discovering the real URL and choosing these actual operation IDs:

```bash
npx uivoid create customer-ops \
  --base-url "$BASE_URL" \
  --openapi "$OPENAPI_URL" \
  --auth-key "$API_TOKEN" \
  --include list_customers,get_customer
```

Use values from the project; these tool names are illustrative. Omit the static credential flag for per-user passthrough configuration. Read `npx uivoid create --help` if installed flags differ.

- Prefer an explicit `--include` allowlist in an agent session. A real interactive terminal can use the endpoint checkbox prompt instead.
- `--exclude-destructive` removes DELETE-derived tools but still includes POST/PUT/PATCH writes. `--yes` includes every discovered operation, including destructive operations; use it only when that exposure is authorized. Non-interactive sessions and `--json` require one selection flag.
- GET defaults to `read`, POST/PUT/PATCH to `write`, DELETE to `destructive`. Review actual semantics: a POST can delete data. Omit mismatched or sensitive operations until their scopes can be configured correctly; the CLI has no per-operation scope override flag.
- `--no-discover` provisions an empty project without tools. Use it only when an empty project is intended, and report endpoint mapping as unfinished.
- Use the URL returned by the CLI, not a guessed hostname: names are normalized and availability may prevent creation. A failed creation attempts rollback; if cleanup fails, report the leftover project before retrying.

## 4. Configure per-user authentication when needed

For a real OAuth provider with the required client registration:

```bash
npx uivoid oauth-config customer-ops \
  --issuer "$OAUTH_ISSUER" \
  --jwks-url "$JWKS_URL" \
  --audience "$OAUTH_AUDIENCE" \
  --login-mode oauth \
  --authorize-url "$AUTHORIZE_URL" \
  --token-url "$TOKEN_URL" \
  --client-id "$OAUTH_CLIENT_ID" \
  --client-secret "$OAUTH_CLIENT_SECRET"
```

Register the callback URL printed by the CLI as an allowed redirect URI with the identity provider. For an application-owned login flow, `--login-mode custom_handoff` instead requires `--handoff-url` and the issuer/JWKS/audience flags. The handoff page must already be implemented; do not guess its URL. See [authentication documentation](https://portal.uivoid.app/docs/authentication).

If any configuration step fails, report the partial state. Saving config alone is not proof that login and tool calls work.

## 5. Verify and hand off

Make a safe read-only request to the target API using the configured auth, then test MCP connection/login, tool discovery, and one authorized read-only tool call when an MCP client is available. Do not invoke write/destructive tools merely to test setup. If client access or identity-provider registration is missing, say exactly what remains unverified.

Return the actual MCP URL, dedicated subdomain, tool count, scopes, auth mode, and verification result. Explain that the API remains on its existing hosting while the MCP gateway runs on UIvoid.

For a target-API 401, check the outbound header and credential separately from UIvoid login. Update a static credential without recreating the project:

```bash
npx uivoid credentials customer-ops --auth-key "$API_TOKEN"
```

**Example request:** “Expose list/get customer operations from my self-hosted API through UIvoid as customer-ops, keeping our existing user login.”

**Expected handoff:** the returned `https://customer-ops.uivoid.app/mcp` URL (if that name was allocated), two read tools, the configured per-user auth mode, and whether login plus a read-only call succeeded. Report pending callback registration or tests rather than claiming completion.

Maintained with [uivoid-cli](https://github.com/corrideluca/uivoid-cli); the npm command is `uivoid`.
